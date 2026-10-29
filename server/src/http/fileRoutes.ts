import { Router, raw, type Request } from "express";
import { join } from "node:path";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { eq, and, asc, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { attachments, cards, cardFields, fields, letterheads, memberships, pdfTemplates, pipes } from "../db/schema.js";
import { getUserIdFromRequest } from "../auth/session.js";
import { logEvent } from "../trpc/cardAccess.js";
import { assertCardWrite, canSeeCard } from "../access.js";
import { recordAudit } from "../audit.js";
import { BRANDING_DIR, buildPdf, isImage, layoutOf, pickLetterhead, sampleContext } from "../pdf.js";

import { UPLOAD_DIR } from "../uploads.js";
export { UPLOAD_DIR };
const MAX_BYTES = 25 * 1024 * 1024;

/** Session user + their org, or null. Same rules as the tRPC context. */
async function caller(req: Request) {
  const userId = await getUserIdFromRequest(req.headers.cookie);
  if (!userId) return null;
  const m = (await db.select().from(memberships).where(eq(memberships.userId, userId)).limit(1))[0];
  return m ? { userId, orgId: m.orgId, role: m.role } : null;
}

type Who = NonNullable<Awaited<ReturnType<typeof caller>>>;

/** The card, if it exists, is not in the trash, belongs to the caller's org and they may see it (M10). */
async function cardFor(cardId: string, who: Who) {
  const row = (await db.select({ id: cards.id, pipeId: cards.pipeId, createdBy: cards.createdBy, deletedAt: cards.deletedAt, orgId: pipes.orgId })
    .from(cards).innerJoin(pipes, eq(pipes.id, cards.pipeId)).where(eq(cards.id, cardId)).limit(1))[0];
  if (!row || row.deletedAt || row.orgId !== who.orgId) return null;
  return (await canSeeCard(row, { userId: who.userId, orgRole: who.role })) ? row : null;
}

/** Message when the caller may not change the card, or null. */
async function writeDenied(card: { id: string; pipeId: string; createdBy: string | null }, who: Who) {
  try { await assertCardWrite(card, { userId: who.userId, orgRole: who.role }); return null; }
  catch (e) { return e instanceof Error ? e.message : "Sem permissão"; }
}

const safeName = (s: string) => s.replace(/[\\/\r\n"]+/g, "_").slice(0, 255) || "arquivo";

/** An "Anexo" field of the card's pipe (not archived), or null. */
async function attachmentField(fieldId: string, pipeId: string) {
  const f = (await db.select().from(fields).where(eq(fields.id, fieldId)).limit(1))[0];
  return f && f.pipeId === pipeId && f.type === "attachment" && !f.archivedAt ? f : null;
}

/** Add/remove an attachment id in the field's value (a list of ids). */
async function editFieldList(cardId: string, fieldId: string, change: (ids: string[]) => string[]) {
  const row = (await db.select().from(cardFields).where(and(eq(cardFields.cardId, cardId), eq(cardFields.fieldId, fieldId))).limit(1))[0];
  const ids = change(Array.isArray(row?.value) ? (row!.value as string[]) : []);
  const filledAt = ids.length ? new Date() : null;
  if (row) await db.update(cardFields).set({ value: ids, filledAt }).where(eq(cardFields.id, row.id));
  else await db.insert(cardFields).values({ id: crypto.randomUUID(), cardId, fieldId, value: ids, filledAt });
}

export const fileRoutes = Router();

/** Upload: raw body, file name in ?name=. Returns the attachment row. */
fileRoutes.post("/files/cards/:cardId", raw({ type: () => true, limit: MAX_BYTES }), async (req, res) => {
  const who = await caller(req);
  if (!who) return res.status(401).json({ error: "Faça login para continuar" });
  const card = await cardFor(String(req.params.cardId), who);
  if (!card) return res.status(404).json({ error: "Card não encontrado" });
  const denied = await writeDenied(card, who);
  if (denied) return res.status(403).json({ error: denied });
  const body = req.body as Buffer;
  if (!Buffer.isBuffer(body) || body.length === 0) return res.status(400).json({ error: "Arquivo vazio" });

  // ?fieldId= → the file belongs to an "Anexo" field (its value lists the ids); else to the card.
  const fieldId = req.query.fieldId ? String(req.query.fieldId) : null;
  if (fieldId && !(await attachmentField(fieldId, card.pipeId))) return res.status(400).json({ error: "Campo de anexo inválido" });

  const id = crypto.randomUUID();
  const dir = join(UPLOAD_DIR, card.id);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, id), body);
  const filename = safeName(String(req.query.name ?? "arquivo"));
  const mimeType = String(req.headers["content-type"] ?? "application/octet-stream").slice(0, 255);
  // cardFieldId holds the *field* id for field attachments (null = card-level "Anexos").
  await db.insert(attachments).values({ id, cardId: card.id, cardFieldId: fieldId, filename, url: `files/${id}`, sizeBytes: body.length, mimeType, uploadedBy: who.userId });
  if (fieldId) await editFieldList(card.id, fieldId, (ids) => [...ids, id]);
  await logEvent(card.id, "attachment_added", who.userId, { attachmentId: id, filename });
  res.json((await db.select().from(attachments).where(eq(attachments.id, id)).limit(1))[0]);
});

/** List a card's attachments. */
fileRoutes.get("/files/cards/:cardId", async (req, res) => {
  const who = await caller(req);
  if (!who) return res.status(401).json({ error: "Faça login para continuar" });
  const card = await cardFor(String(req.params.cardId), who);
  if (!card) return res.status(404).json({ error: "Card não encontrado" });
  const fieldId = req.query.fieldId ? String(req.query.fieldId) : null;
  const scope = fieldId ? eq(attachments.cardFieldId, fieldId) : isNull(attachments.cardFieldId);
  res.json(await db.select().from(attachments).where(and(eq(attachments.cardId, card.id), scope)).orderBy(asc(attachments.createdAt)));
});

/** Download (inline for images/PDF, otherwise as a file). */
fileRoutes.get("/files/:id", async (req, res) => {
  const who = await caller(req);
  if (!who) return res.status(401).send("Faça login para continuar");
  const att = (await db.select().from(attachments).where(eq(attachments.id, String(req.params.id))).limit(1))[0];
  if (!att?.cardId || !(await cardFor(att.cardId, who))) return res.status(404).send("Arquivo não encontrado");
  const path = join(UPLOAD_DIR, att.cardId, att.id);
  if (!existsSync(path)) return res.status(404).send("Arquivo não encontrado no disco");
  const inline = /^(image\/|application\/pdf)/.test(att.mimeType ?? "");
  res.setHeader("Content-Type", att.mimeType ?? "application/octet-stream");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(att.filename)}`);
  res.sendFile(path);
});

/** Delete: the uploader or an admin. */
fileRoutes.delete("/files/:id", async (req, res) => {
  const who = await caller(req);
  if (!who) return res.status(401).json({ error: "Faça login para continuar" });
  const att = (await db.select().from(attachments).where(eq(attachments.id, String(req.params.id))).limit(1))[0];
  const card = att?.cardId ? await cardFor(att.cardId, who) : null;
  if (!att?.cardId || !card) return res.status(404).json({ error: "Arquivo não encontrado" });
  const denied = await writeDenied(card, who);
  if (denied) return res.status(403).json({ error: denied });
  if (att.uploadedBy !== who.userId && who.role !== "admin") return res.status(403).json({ error: "Só quem enviou pode excluir" });
  await db.delete(attachments).where(eq(attachments.id, att.id));
  if (att.cardFieldId) await editFieldList(att.cardId, att.cardFieldId, (ids) => ids.filter((x) => x !== att.id));
  await unlink(join(UPLOAD_DIR, att.cardId, att.id)).catch(() => undefined);
  await logEvent(att.cardId, "attachment_removed", who.userId, { filename: att.filename });
  res.json({ ok: true });
});

// --- Papéis timbrados (frentes) dos PDFs --------------------------------------------
const MAX_LOGO = 2 * 1024 * 1024;

/** Delete a logo file unless another frente still uses it (migrated frentes may share one). */
export async function dropLogoFile(logo: string) {
  const users = await db.select({ id: letterheads.id }).from(letterheads).where(eq(letterheads.logo, logo)).limit(1);
  if (!users.length) await unlink(join(BRANDING_DIR, logo)).catch(() => undefined);
}

async function letterheadFor(req: Request, admin: boolean) {
  const who = await caller(req);
  if (!who) return { error: [401, "Faça login para continuar"] as const };
  if (admin && who.role !== "admin") return { error: [403, "Apenas administradores"] as const };
  const lh = (await db.select().from(letterheads).where(and(eq(letterheads.id, String(req.params.id)), eq(letterheads.orgId, who.orgId))).limit(1))[0];
  if (!lh) return { error: [404, "Papel timbrado não encontrado"] as const };
  return { who, lh };
}

/** Upload a frente's logo (PNG or JPEG, up to 2 MB); replaces the previous one. */
fileRoutes.post("/files/branding/letterheads/:id/logo", raw({ type: () => true, limit: MAX_LOGO }), async (req, res) => {
  const r = await letterheadFor(req, true);
  if ("error" in r) return res.status(r.error![0]).json({ error: r.error![1] });
  const body = req.body as Buffer;
  if (!Buffer.isBuffer(body) || !isImage(body)) return res.status(400).json({ error: "Envie uma imagem PNG ou JPG." });
  const id = crypto.randomUUID();
  await mkdir(BRANDING_DIR, { recursive: true });
  await writeFile(join(BRANDING_DIR, id), body);
  await db.update(letterheads).set({ logo: id }).where(eq(letterheads.id, r.lh.id));
  if (r.lh.logo) await dropLogoFile(r.lh.logo);
  await recordAudit(r.who.orgId, r.who.userId, "letterhead.uploadLogo", { id: r.lh.id, name: r.lh.name, bytes: body.length });
  res.json({ ok: true });
});

fileRoutes.delete("/files/branding/letterheads/:id/logo", async (req, res) => {
  const r = await letterheadFor(req, true);
  if ("error" in r) return res.status(r.error![0]).json({ error: r.error![1] });
  await db.update(letterheads).set({ logo: null }).where(eq(letterheads.id, r.lh.id));
  if (r.lh.logo) await dropLogoFile(r.lh.logo);
  await recordAudit(r.who.orgId, r.who.userId, "letterhead.removeLogo", { id: r.lh.id, name: r.lh.name });
  res.json({ ok: true });
});

fileRoutes.get("/files/branding/letterheads/:id/logo", async (req, res) => {
  const r = await letterheadFor(req, false);
  if ("error" in r) return res.status(r.error![0]).send(r.error![1]);
  const path = r.lh.logo ? join(BRANDING_DIR, r.lh.logo) : null;
  if (!path || !existsSync(path)) return res.status(404).send("Sem logo");
  res.setHeader("Cache-Control", "no-store");
  res.sendFile(path);
});

/** "Ver exemplo": a made-up card printed with a frente (?letterheadId=) or as a modelo would (?templateId=). */
fileRoutes.get("/files/branding/preview", async (req, res) => {
  const who = await caller(req);
  if (!who) return res.status(401).send("Faça login para continuar");
  const ctx = sampleContext();
  let lh = null;
  let body: string | null = null;
  if (req.query.templateId) {
    const tpl = (await db.select().from(pdfTemplates).where(eq(pdfTemplates.id, String(req.query.templateId))).limit(1))[0];
    const pipe = tpl ? (await db.select({ orgId: pipes.orgId }).from(pipes).where(eq(pipes.id, tpl.pipeId)).limit(1))[0] : undefined;
    if (!tpl || pipe?.orgId !== who.orgId) return res.status(404).send("Modelo não encontrado");
    lh = await pickLetterhead(who.orgId, tpl.pipeId, tpl, ctx.fill);
    body = tpl.body;
  } else if (req.query.letterheadId) {
    lh = (await db.select().from(letterheads).where(and(eq(letterheads.id, String(req.query.letterheadId)), eq(letterheads.orgId, who.orgId))).limit(1))[0] ?? null;
    if (!lh) return res.status(404).send("Papel timbrado não encontrado");
  }
  const bytes = await buildPdf(ctx, await layoutOf(who.orgId, lh), body);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Disposition", 'inline; filename="exemplo.pdf"');
  res.send(bytes);
});
