import { Router, raw, type Request } from "express";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import { eq, and, asc, isNull } from "drizzle-orm";
import { db } from "../db/client.js";
import { attachments, cards, cardFields, fields, memberships, pipes } from "../db/schema.js";
import { getUserIdFromRequest } from "../auth/session.js";
import { logEvent } from "../trpc/cardAccess.js";

// Attachments live on the VM's disk (decision 2026-10-28), outside the repo's code:
// <repo>/data/uploads/<cardId>/<attachmentId>. From server/{src,dist}/http that is ../../../data.
export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../../data/uploads");
const MAX_BYTES = 25 * 1024 * 1024;

/** Session user + their org, or null. Same rules as the tRPC context. */
async function caller(req: Request) {
  const userId = await getUserIdFromRequest(req.headers.cookie);
  if (!userId) return null;
  const m = (await db.select().from(memberships).where(eq(memberships.userId, userId)).limit(1))[0];
  return m ? { userId, orgId: m.orgId, role: m.role } : null;
}

/** The card, if it exists, is not in the trash and belongs to the caller's org. */
async function cardFor(cardId: string, orgId: string) {
  const row = (await db.select({ id: cards.id, pipeId: cards.pipeId, deletedAt: cards.deletedAt, orgId: pipes.orgId })
    .from(cards).innerJoin(pipes, eq(pipes.id, cards.pipeId)).where(eq(cards.id, cardId)).limit(1))[0];
  return row && !row.deletedAt && row.orgId === orgId ? row : null;
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
  const card = await cardFor(String(req.params.cardId), who.orgId);
  if (!card) return res.status(404).json({ error: "Card não encontrado" });
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
  const card = await cardFor(String(req.params.cardId), who.orgId);
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
  if (!att?.cardId || !(await cardFor(att.cardId, who.orgId))) return res.status(404).send("Arquivo não encontrado");
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
  if (!att?.cardId || !(await cardFor(att.cardId, who.orgId))) return res.status(404).json({ error: "Arquivo não encontrado" });
  if (att.uploadedBy !== who.userId && who.role !== "admin") return res.status(403).json({ error: "Só quem enviou pode excluir" });
  await db.delete(attachments).where(eq(attachments.id, att.id));
  if (att.cardFieldId) await editFieldList(att.cardId, att.cardFieldId, (ids) => ids.filter((x) => x !== att.id));
  await unlink(join(UPLOAD_DIR, att.cardId, att.id)).catch(() => undefined);
  await logEvent(att.cardId, "attachment_removed", who.userId, { filename: att.filename });
  res.json({ ok: true });
});
