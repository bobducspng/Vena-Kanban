import { join } from "node:path";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "./db/client.js";
import { attachments, cardEmails, cardEvents, emailTemplates } from "./db/schema.js";
import { sendCardMail } from "./mailer.js";
import { cardContext } from "./templates.js";
import { UPLOAD_DIR } from "./uploads.js";

const MAX_ATTACH_BYTES = 20 * 1024 * 1024; // Gmail's limit is 25 MB including encoding

export type EmailFormat = "text" | "html";

/** Card data inside an HTML template: escaped, line breaks kept. */
export const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!).replace(/\r?\n/g, "<br>");

/** Plain-text version of an HTML e-mail (for clients that do not show HTML, and the history). */
export function htmlToText(html: string) {
  return html
    .replace(/<(head|style|script|title)[\s\S]*?<\/\1>/gi, "")
    .replace(/<a\s[^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, label: string) => `${label.replace(/<[^>]+>/g, "").trim()} (${href})`)
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|h[1-6]|li|table|section)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** Send an e-mail from a card and record it (history + activity). Throws with the reason. */
export async function sendFromCard(m: {
  cardId: string; to: string[]; cc?: string[]; subject: string; body: string; format?: EmailFormat; attachmentIds?: string[];
  templateId?: string | null; sentBy?: string | null; via?: string; replyTo?: string;
}) {
  const files = m.attachmentIds?.length
    ? await db.select().from(attachments).where(and(eq(attachments.cardId, m.cardId), inArray(attachments.id, m.attachmentIds)))
    : [];
  if (files.reduce((s, f) => s + (f.sizeBytes ?? 0), 0) > MAX_ATTACH_BYTES) throw new Error("anexos passam de 20 MB");
  const row = {
    id: crypto.randomUUID(), cardId: m.cardId, templateId: m.templateId ?? null, toList: m.to.join(", "), ccList: m.cc?.join(", ") || null,
    subject: m.subject, body: m.body, format: m.format ?? "text", attachmentIds: files.map((f) => f.id), sentBy: m.sentBy ?? null, via: m.via ?? null,
  };
  try {
    await sendCardMail({
      to: m.to, cc: m.cc, subject: m.subject, replyTo: m.replyTo,
      ...(m.format === "html" ? { html: m.body, body: htmlToText(m.body) } : { body: m.body }),
      attachments: files.map((f) => ({ filename: f.filename, path: join(UPLOAD_DIR, m.cardId, f.id), contentType: f.mimeType ?? undefined })),
    });
    await db.insert(cardEmails).values({ ...row, status: "sent" });
    await db.insert(cardEvents).values({ id: crypto.randomUUID(), cardId: m.cardId, type: "email_sent", actorId: m.sentBy ?? null, data: { to: row.toList, subject: m.subject, ...(m.via ? { automation: m.via } : {}) } });
  } catch (err) {
    const why = err instanceof Error ? err.message : String(err);
    await db.insert(cardEmails).values({ ...row, status: "failed", error: why });
    throw new Error(why);
  }
}

/** A template rendered for a card: recipients resolved, placeholders filled. */
export async function renderTemplate(templateId: string, cardId: string) {
  const t = (await db.select().from(emailTemplates).where(eq(emailTemplates.id, templateId)).limit(1))[0];
  if (!t) throw new Error("template não encontrado");
  const ctx = await cardContext(cardId);
  const format = (t.format === "html" ? "html" : "text") as EmailFormat;
  return {
    template: t, format, to: ctx.recipients(t.toSpec), cc: ctx.recipients(t.ccSpec), subject: ctx.fill(t.subject),
    body: format === "html" ? ctx.fill(t.body, escapeHtml) : ctx.fill(t.body),
  };
}
