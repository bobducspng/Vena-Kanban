import { Router, type NextFunction, type Request, type Response } from "express";
import rateLimit from "express-rate-limit";
import { createHash } from "node:crypto";
import { and, asc, desc, eq, gte, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../db/client.js";
import { apiTokens, cardEvents, cards, fields, phases, pipes } from "../db/schema.js";
import { cardSnapshot } from "../cardSnapshot.js";
import { Converter, importCards, NOT_IMPORTABLE, PHASE, TITLE, type Cell } from "../importer.js";
import { moveCard, setFieldValue } from "../cardService.js";

/**
 * API do Venaflow (M13), for other systems. Authorization: Bearer <chave> (Configurações >
 * Integrações). A key acts for the whole organisation, like an admin. Fields are given by
 * name (or id) with the same conversions as the spreadsheet import:
 *   GET    /api/v1/pipes                         pipes with phases and fields
 *   GET    /api/v1/pipes/:id/cards               ?phase=&updated_since=&status=open|done&limit=&offset=
 *   POST   /api/v1/pipes/:id/cards               { title?, phase?, fields: { "Nome do campo": valor } }
 *   GET    /api/v1/cards/:id                     (id or #number with ?pipe=)
 *   PATCH  /api/v1/cards/:id                     { fields: { ... } }
 *   POST   /api/v1/cards/:id/move                { phase: "Nome da fase" }
 */
export const apiRoutes = Router();
type Auth = { orgId: string; userId: string | null; name: string };
const authOf = (res: Response) => res.locals.auth as Auth;
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

class ApiError extends Error { constructor(public status: number, message: string) { super(message); } }

async function authenticate(req: Request, res: Response, next: NextFunction) {
  const m = /^Bearer\s+(\S+)$/i.exec(req.headers.authorization ?? "");
  if (!m) return res.status(401).json({ error: "Envie a chave no cabeçalho Authorization: Bearer <chave>" });
  const tok = (await db.select().from(apiTokens).where(eq(apiTokens.tokenHash, hashToken(m[1]))).limit(1))[0];
  if (!tok || tok.revokedAt) return res.status(401).json({ error: "Chave inválida ou revogada" });
  res.locals.auth = { orgId: tok.orgId, userId: tok.createdBy, name: tok.name } satisfies Auth;
  if (!tok.lastUsedAt || Date.now() - tok.lastUsedAt.getTime() > 60_000) await db.update(apiTokens).set({ lastUsedAt: new Date() }).where(eq(apiTokens.id, tok.id));
  next();
}

apiRoutes.use("/api/v1", rateLimit({
  windowMs: 60_000, limit: 120, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => hashToken(req.headers.authorization ?? "anon"),
  message: { error: "Limite de 120 chamadas por minuto atingido" },
}), authenticate);

/** Wrap a handler: errors become JSON with a sensible status. */
const h = (fn: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response) => {
  try {
    const out = await fn(req, res);
    if (!res.headersSent) res.json(out);
  } catch (err) {
    const status = err instanceof ApiError ? err.status : err instanceof TRPCError ? (err.code === "NOT_FOUND" ? 404 : err.code === "CONFLICT" ? 409 : 400) : 500;
    if (status === 500) console.error("api error:", err);
    res.status(status).json({ error: status === 500 ? "Erro interno" : (err as Error).message });
  }
};

async function pipeOf(id: string, orgId: string) {
  const p = (await db.select().from(pipes).where(and(eq(pipes.id, id), eq(pipes.orgId, orgId), isNull(pipes.deletedAt))).limit(1))[0];
  if (!p) throw new ApiError(404, "Pipe não encontrado");
  return p;
}
async function cardOf(req: Request, orgId: string) {
  const raw = String(req.params.id);
  const num = /^#?(\d+)$/.exec(raw);
  const where = num && req.query.pipe ? and(eq(cards.pipeId, String(req.query.pipe)), eq(cards.number, +num[1])) : eq(cards.id, raw);
  const c = (await db.select().from(cards).where(where).limit(1))[0];
  if (!c || c.deletedAt) throw new ApiError(404, "Card não encontrado");
  await pipeOf(c.pipeId, orgId);
  return c;
}
/** { "Nome": valor } → [field, cell] using names or ids. */
async function resolveFields(pipeId: string, input: unknown) {
  if (input === undefined) return [];
  if (!input || typeof input !== "object" || Array.isArray(input)) throw new ApiError(400, "\"fields\" deve ser um objeto { \"Nome do campo\": valor }");
  const defs = await db.select().from(fields).where(and(eq(fields.pipeId, pipeId), isNull(fields.archivedAt)));
  return Object.entries(input as Record<string, unknown>).map(([k, v]) => {
    const f = defs.find((d) => d.id === k) ?? defs.find((d) => norm(d.label) === norm(k));
    if (!f) throw new ApiError(400, `Campo "${k}" não existe neste pipe`);
    if (NOT_IMPORTABLE.has(f.type)) throw new ApiError(400, `O campo "${f.label}" não pode ser preenchido pela API`);
    const cell: Cell = Array.isArray(v) ? v.join("; ") : v === undefined ? null : (typeof v === "object" && v !== null ? JSON.stringify(v) : (v as Cell));
    return { f, cell };
  });
}

apiRoutes.get("/api/v1/pipes", h(async (_req, res) => {
  const { orgId } = authOf(res);
  const list = await db.select().from(pipes).where(and(eq(pipes.orgId, orgId), isNull(pipes.deletedAt))).orderBy(asc(pipes.name));
  return Promise.all(list.map(async (p) => ({
    id: p.id, name: p.name,
    phases: (await db.select({ id: phases.id, name: phases.name, isStart: phases.isStart, isEnd: phases.isEnd }).from(phases).where(eq(phases.pipeId, p.id)).orderBy(asc(phases.position))),
    fields: (await db.select({ id: fields.id, label: fields.label, type: fields.type, phaseId: fields.phaseId, required: fields.required, options: fields.options }).from(fields)
      .where(and(eq(fields.pipeId, p.id), isNull(fields.archivedAt))).orderBy(asc(fields.position))),
  })));
}));

apiRoutes.get("/api/v1/pipes/:id/cards", h(async (req, res) => {
  const p = await pipeOf(String(req.params.id), authOf(res).orgId);
  const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const conds = [eq(cards.pipeId, p.id), isNull(cards.deletedAt)];
  if (req.query.updated_since) {
    const d = new Date(String(req.query.updated_since));
    if (Number.isNaN(d.getTime())) throw new ApiError(400, "updated_since inválido (use ISO 8601)");
    conds.push(gte(cards.updatedAt, d));
  }
  if (req.query.status === "open") conds.push(eq(cards.done, false));
  if (req.query.status === "done") conds.push(eq(cards.done, true));
  if (req.query.phase) {
    const ph = (await db.select().from(phases).where(eq(phases.pipeId, p.id))).find((x) => x.id === req.query.phase || norm(x.name) === norm(String(req.query.phase)));
    if (!ph) throw new ApiError(400, "Fase não encontrada");
    conds.push(eq(cards.currentPhaseId, ph.id));
  }
  const rows = await db.select({ id: cards.id }).from(cards).where(and(...conds)).orderBy(desc(cards.updatedAt)).limit(limit + 1).offset(offset);
  const page = rows.slice(0, limit);
  const out = [];
  for (const r of page) out.push(await cardSnapshot(r.id));
  return { cards: out, hasMore: rows.length > limit, nextOffset: rows.length > limit ? offset + limit : null };
}));

apiRoutes.get("/api/v1/cards/:id", h(async (req, res) => cardSnapshot((await cardOf(req, authOf(res).orgId)).id)));

apiRoutes.post("/api/v1/pipes/:id/cards", h(async (req, res) => {
  const a = authOf(res);
  const p = await pipeOf(String(req.params.id), a.orgId);
  const body = (req.body ?? {}) as { title?: unknown; phase?: unknown; fields?: unknown };
  const list = await resolveFields(p.id, body.fields);
  const mapping = [TITLE, PHASE, ...list.map((x) => x.f.id)];
  const row: Cell[] = [typeof body.title === "string" ? body.title : null, typeof body.phase === "string" ? body.phase : null, ...list.map((x) => x.cell)];
  const [r] = await importCards({ pipeId: p.id, orgId: a.orgId, userId: a.userId ?? "", mapping, rows: [row], firstRow: 1, dryRun: false, runAutomations: true, via: `API (${a.name})` });
  if (!r) throw new ApiError(400, "Nada para criar");
  if (!r.ok) throw new ApiError(400, r.error ?? "Não foi possível criar o card");
  const c = (await db.select({ id: cards.id }).from(cards).where(and(eq(cards.pipeId, p.id), eq(cards.number, r.number!))).limit(1))[0];
  res.status(201);
  return cardSnapshot(c.id);
}));

apiRoutes.patch("/api/v1/cards/:id", h(async (req, res) => {
  const a = authOf(res);
  const card = await cardOf(req, a.orgId);
  const body = (req.body ?? {}) as { title?: unknown; fields?: unknown };
  const actor = { userId: a.userId, via: `API (${a.name})`, depth: 0 };
  if (typeof body.title === "string" && body.title.trim() && body.title.trim() !== card.title) {
    const p = await pipeOf(card.pipeId, a.orgId);
    if (p.titleFieldId) throw new ApiError(400, "O título deste pipe vem de um campo: altere o campo");
    await db.update(cards).set({ title: body.title.trim().slice(0, 512) }).where(eq(cards.id, card.id));
    await db.insert(cardEvents).values({ id: crypto.randomUUID(), cardId: card.id, type: "title_updated", actorId: a.userId, data: { via: actor.via } });
  }
  const conv = new Converter(a.orgId);
  for (const { f, cell } of await resolveFields(card.pipeId, body.fields)) {
    let value: unknown;
    try { value = await conv.value(f, cell); } catch (e) { throw new ApiError(400, `${f.label}: ${(e as Error).message}`); }
    const fresh = (await db.select().from(cards).where(eq(cards.id, card.id)).limit(1))[0];
    await setFieldValue({ card: fresh, fieldId: f.id, value: value === undefined ? null : value, orgId: a.orgId, actor, checkEditable: false });
  }
  return cardSnapshot(card.id);
}));

apiRoutes.post("/api/v1/cards/:id/move", h(async (req, res) => {
  const a = authOf(res);
  const card = await cardOf(req, a.orgId);
  const want = String((req.body as { phase?: unknown } | undefined)?.phase ?? "");
  const ph = (await db.select().from(phases).where(eq(phases.pipeId, card.pipeId))).find((x) => x.id === want || norm(x.name) === norm(want));
  if (!ph) throw new ApiError(400, "Fase não encontrada");
  await moveCard({ card, toPhaseId: ph.id, actor: { userId: a.userId, via: `API (${a.name})`, depth: 0 }, checkTransition: false });
  return cardSnapshot(card.id);
}));

apiRoutes.use("/api/v1", (_req, res) => res.status(404).json({ error: "Rota não encontrada. Veja Configurações > Integrações." }));
