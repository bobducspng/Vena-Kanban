import { randomBytes } from "node:crypto";
import { ImapFlow } from "imapflow";
import { simpleParser, type AddressObject, type ParsedMail } from "mailparser";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./db/client.js";
import { cardAssignees, cardEmails, cards, fields, inboxState, organizations, phases, pipes } from "./db/schema.js";
import { env } from "./env.js";
import { createCard, setFieldValue } from "./cardService.js";
import { saveCardFile } from "./pdf.js";
import { logEvent } from "./trpc/cardAccess.js";
import { notifyOutside } from "./notify.js";
import { htmlToText } from "./emails.js";

/**
 * Caixa de entrada (M13). The sending Google account (SMTP_USER) is read over IMAP with
 * the same app password, once a minute. Gmail delivers "plus" addresses to the same box:
 *   <conta>+p-<token>@dominio   → creates a card in that pipe (subject = title)
 *   <conta>+c-<token>@dominio   → the e-mail joins that card (replies to card e-mails)
 * A reply that lost the "+" address still finds its card through In-Reply-To. Every other
 * message of the box is left alone. Only new mail is read (from the moment it is turned on).
 */

const MAX_BYTES = 30 * 1024 * 1024;
const [LOCAL, DOMAIN] = (env.SMTP_USER || "@").split("@");
export const inboxConfigured = () => !!(env.SMTP_USER && env.SMTP_PASS && /gmail|google/i.test(env.SMTP_HOST || "smtp.gmail.com"));
const newToken = () => randomBytes(8).toString("base64url").replace(/[^a-zA-Z0-9]/g, "").toLowerCase().slice(0, 10).padEnd(10, "x");
export const pipeAddress = (token: string) => `${LOCAL}+p-${token}@${DOMAIN}`;
export const cardAddress = (token: string) => `${LOCAL}+c-${token}@${DOMAIN}`;

export async function ensurePipeToken(pipeId: string) {
  const p = (await db.select({ t: pipes.inboxToken }).from(pipes).where(eq(pipes.id, pipeId)).limit(1))[0];
  if (p?.t) return p.t;
  const t = newToken();
  await db.update(pipes).set({ inboxToken: t }).where(eq(pipes.id, pipeId));
  return t;
}
export async function ensureCardToken(cardId: string) {
  const c = (await db.select({ t: cards.inboxToken }).from(cards).where(eq(cards.id, cardId)).limit(1))[0];
  if (c?.t) return c.t;
  const t = newToken();
  await db.update(cards).set({ inboxToken: t }).where(eq(cards.id, cardId));
  return t;
}
/** Is the inbox on for the org of this card? (then card e-mails reply to the card) */
export async function inboxOnForCard(cardId: string) {
  const r = (await db.select({ on: inboxState.enabled }).from(cards).innerJoin(pipes, eq(pipes.id, cards.pipeId))
    .innerJoin(inboxState, eq(inboxState.orgId, pipes.orgId)).where(eq(cards.id, cardId)).limit(1))[0];
  return !!r?.on && inboxConfigured();
}

const client = () => new ImapFlow({
  host: "imap.gmail.com", port: 993, secure: true, logger: false,
  auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
});

/** Turning on: check the login and start after the newest message (old mail is not read). */
export async function enableInbox(orgId: string) {
  if (!inboxConfigured()) throw new Error("a conta de envio (SMTP) não é do Google ou não está configurada");
  const c = client();
  try {
    await c.connect();
    const box = await c.mailboxOpen("INBOX");
    const row = { enabled: true, uidValidity: Number(box.uidValidity), lastUid: Math.max(0, Number(box.uidNext) - 1), lastError: null, lastCheckAt: new Date() };
    await db.insert(inboxState).values({ orgId, ...row }).onDuplicateKeyUpdate({ set: row });
  } finally {
    await c.logout().catch(() => undefined);
  }
}
export async function disableInbox(orgId: string) {
  await db.update(inboxState).set({ enabled: false }).where(eq(inboxState.orgId, orgId));
}

export const addressesOf = (m: ParsedMail) => {
  const list = [m.to, m.cc, m.bcc].flatMap((a) => (Array.isArray(a) ? a : a ? [a] : [])) as AddressObject[];
  // Hidden copy (Cco) only shows in these headers; read the raw lines (the parsed value may be an object).
  const extra = (m.headerLines ?? []).filter((l) => ["delivered-to", "x-original-to"].includes(l.key))
    .flatMap((l) => [...l.line.matchAll(/[\w.+-]+@[\w.-]+/g)].map((x) => x[0]));
  return [...list.flatMap((a) => a.value.map((v) => v.address ?? "")), ...extra].map((s) => s.toLowerCase());
};
export const tagOf = (addrs: string[]) => {
  const re = new RegExp(`^${LOCAL.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\+([pc])-([a-z0-9]+)@`, "i");
  for (const a of addrs) { const m = re.exec(a.trim()); if (m) return { kind: m[1].toLowerCase() as "p" | "c", token: m[2].toLowerCase() }; }
  return null;
};
const fromOf = (m: ParsedMail) => (m.from?.value[0]?.address ?? "").toLowerCase();

/** The e-mail joins the card: history, attachments, activity and a heads-up to its people. */
async function appendToCard(cardId: string, m: ParsedMail) {
  const from = fromOf(m);
  const html = typeof m.html === "string" ? m.html : null;
  const body = (html ?? m.text ?? "").slice(0, 1_000_000) || "(sem texto)";
  const files = [];
  for (const a of m.attachments ?? []) {
    if (a.contentDisposition === "inline" && a.related) continue; // images of the e-mail body
    const f = await saveCardFile(cardId, (a.filename || "anexo").slice(0, 200), a.content, a.contentType || "application/octet-stream", null);
    if (f) files.push(f.id);
  }
  const to = addressesOf(m).join(", ").slice(0, 2000);
  await db.insert(cardEmails).values({
    id: crypto.randomUUID(), cardId, direction: "in", fromAddress: from.slice(0, 320), toList: to || "-", subject: (m.subject ?? "(sem assunto)").slice(0, 500),
    body, format: html ? "html" : "text", attachmentIds: files, status: "received", messageId: m.messageId?.slice(0, 255) ?? null,
  });
  await logEvent(cardId, "email_received", null, { from, subject: m.subject ?? "", attachments: files.length });
  const people = (await db.select({ userId: cardAssignees.userId }).from(cardAssignees).where(eq(cardAssignees.cardId, cardId))).map((a) => a.userId);
  const senders = (await db.select({ userId: cardEmails.sentBy }).from(cardEmails).where(and(eq(cardEmails.cardId, cardId), eq(cardEmails.direction, "out")))).map((r) => r.userId).filter(Boolean) as string[];
  await notifyOutside([...new Set([...people, ...senders])], cardId, "E-mail recebido no card", `${from}: ${m.subject ?? ""}`);
}

/** A new card in the pipe from the e-mail. */
async function createFromEmail(pipe: typeof pipes.$inferSelect, m: ParsedMail) {
  const from = fromOf(m);
  const allowed = (pipe.inboxAllowedDomains ?? "").split(/[,;\s]+/).map((d) => d.trim().toLowerCase().replace(/^@/, "")).filter(Boolean);
  if (allowed.length && !allowed.some((d) => from.endsWith(`@${d}`) || from.endsWith(`.${d}`))) return "remetente fora dos domínios aceitos";
  const subject = (m.subject ?? "").trim() || "(sem assunto)";
  const text = (m.text ?? (typeof m.html === "string" ? htmlToText(m.html) : "")).trim();
  const defs = await db.select().from(fields).where(and(eq(fields.pipeId, pipe.id), isNull(fields.archivedAt)));
  const start = (await db.select().from(phases).where(and(eq(phases.pipeId, pipe.id), eq(phases.isStart, true))).limit(1))[0];
  const wanted: { fieldId: string; value: unknown }[] = [];
  const fFrom = defs.find((d) => d.id === pipe.inboxFromFieldId);
  if (fFrom && from) wanted.push({ fieldId: fFrom.id, value: from });
  const fBody = defs.find((d) => d.id === pipe.inboxBodyFieldId);
  if (fBody && text) wanted.push({ fieldId: fBody.id, value: fBody.type === "short_text" ? text.slice(0, 255) : text.slice(0, 50_000) });
  const fTitle = defs.find((d) => d.id === pipe.titleFieldId);
  if (fTitle && !wanted.some((w) => w.fieldId === fTitle.id)) wanted.push({ fieldId: fTitle.id, value: subject.slice(0, 255) });
  const startVals = wanted.filter((w) => defs.find((d) => d.id === w.fieldId)?.phaseId === start?.id);
  const actor = { userId: null, via: "E-mail", depth: 0 };
  // The team completes what the e-mail does not bring: required fields do not block.
  const cardId = await createCard({ pipeId: pipe.id, title: subject.slice(0, 512), values: startVals, orgId: pipe.orgId, actor, skipRequiredTypes: [...new Set(defs.map((d) => d.type))] });
  for (const w of wanted.filter((x) => !startVals.includes(x))) {
    const card = (await db.select().from(cards).where(eq(cards.id, cardId)).limit(1))[0];
    await setFieldValue({ card, fieldId: w.fieldId, value: w.value, orgId: pipe.orgId, actor, checkEditable: false }).catch(() => undefined);
  }
  await ensureCardToken(cardId);
  await appendToCard(cardId, m);
  return null;
}

/** One message: where it goes (or nowhere). Returns a note for the log, or null. */
export async function routeMessage(orgId: string, m: ParsedMail): Promise<string | null> {
  const from = fromOf(m);
  if (!from || from === env.SMTP_USER.toLowerCase()) return null; // our own mail
  const auto = String(m.headers.get("auto-submitted") ?? "no").toLowerCase();
  if (auto !== "no" || m.headers.has("x-autoreply") || m.headers.has("x-autorespond")) return null; // férias, avisos automáticos
  const tag = tagOf(addressesOf(m));
  if (tag?.kind === "c") {
    const c = (await db.select({ id: cards.id, deletedAt: cards.deletedAt }).from(cards).where(eq(cards.inboxToken, tag.token)).limit(1))[0];
    if (c && !c.deletedAt) { await appendToCard(c.id, m); return null; }
  }
  if (tag?.kind === "p") {
    const p = (await db.select().from(pipes).where(and(eq(pipes.inboxToken, tag.token), eq(pipes.orgId, orgId))).limit(1))[0];
    if (p && p.inboxEnabled && !p.deletedAt) return createFromEmail(p, m);
    return null;
  }
  // A reply without the "+" address: find the card by the message it answers.
  const refs = [m.inReplyTo, ...(Array.isArray(m.references) ? m.references : m.references ? [m.references] : [])].filter(Boolean) as string[];
  if (refs.length) {
    const hit = (await db.select({ cardId: cardEmails.cardId }).from(cardEmails).where(inArray(cardEmails.messageId, refs.map((r) => r.slice(0, 255)))).limit(1))[0];
    if (hit) { await appendToCard(hit.cardId, m); return null; }
  }
  return null;
}

let running = false;
/** Read what arrived since last time (every minute). */
export async function checkInbox() {
  if (running || !inboxConfigured()) return;
  running = true;
  try {
    const states = await db.select().from(inboxState).where(eq(inboxState.enabled, true));
    for (const st of states) {
      const c = client();
      let lastUid = st.lastUid ?? 0, processed = 0, error: string | null = null;
      try {
        await c.connect();
        const lock = await c.getMailboxLock("INBOX");
        try {
          const box = c.mailbox as { uidValidity: bigint | number; uidNext: number };
          if (Number(box.uidValidity) !== st.uidValidity) lastUid = Math.max(0, box.uidNext - 1); // box was reset: start fresh
          else if (box.uidNext - 1 > lastUid) {
            const uids = (await c.search({ uid: `${lastUid + 1}:*` }, { uid: true })) || [];
            for (const uid of uids.filter((u) => u > lastUid).sort((a, b) => a - b)) {
              try {
                const msg = await c.fetchOne(String(uid), { source: true, size: true }, { uid: true });
                if (msg && msg.source && (msg.size ?? 0) <= MAX_BYTES) {
                  await routeMessage(st.orgId, await simpleParser(msg.source));
                  processed++;
                }
              } catch (err) {
                console.error(`inbox: message ${uid} failed:`, err);
              }
              lastUid = uid;
            }
          }
          await db.update(inboxState).set({ uidValidity: Number(box.uidValidity) }).where(eq(inboxState.orgId, st.orgId));
        } finally {
          lock.release();
        }
      } catch (err) {
        error = err instanceof Error ? err.message : String(err);
      } finally {
        await c.logout().catch(() => undefined);
      }
      await db.update(inboxState).set({ lastUid, lastCheckAt: new Date(), lastError: error, processed: (st.processed ?? 0) + processed }).where(eq(inboxState.orgId, st.orgId));
    }
  } finally {
    running = false;
  }
}

export function startInbox() {
  setInterval(() => void checkInbox().catch((e) => console.error("inbox:", e)), 60_000);
}

export async function inboxStatus(orgId: string) {
  const st = (await db.select().from(inboxState).where(eq(inboxState.orgId, orgId)).limit(1))[0];
  const org = (await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, orgId)).limit(1))[0];
  return { configured: inboxConfigured(), account: env.SMTP_USER || null, enabled: !!st?.enabled && !!org, lastCheckAt: st?.lastCheckAt ?? null, lastError: st?.lastError ?? null, processed: st?.processed ?? 0 };
}
