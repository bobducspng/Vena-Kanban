import { Router } from "express";
import rateLimit from "express-rate-limit";
import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./db/client.js";
import { biFeeds, cardAssignees, cardFields, cardLabels, cardPhaseHistory, cards, fields, labels, phases, pipes, tableRecords, users } from "./db/schema.js";
import { env } from "./env.js";
import { businessMinutesBetween } from "./businessTime.js";
import { calendarOf } from "./slaService.js";

/**
 * Power BI feed (Web connector): read-only JSON behind a secret token per org.
 * The database stays closed; this only serves flat tables for analysis.
 *   /public/bi/:token/pipes                      → the pipes and their URLs
 *   /public/bi/:token/pipes/:pipeId/cards        → one row per card, one column per field
 *   /public/bi/:token/pipes/:pipeId/phase-history → one row per stay in a phase
 */
export const biUrl = (token: string) => `${env.PUBLIC_BASE_URL}/public/bi/${token}`;

export const biRoutes = Router();
const limit = rateLimit({ windowMs: 60_000, limit: 30, standardHeaders: true, legacyHeaders: false });

async function orgOf(token: string) {
  return (await db.select({ orgId: biFeeds.orgId }).from(biFeeds).where(eq(biFeeds.token, token)).limit(1))[0]?.orgId ?? null;
}
async function pipeOf(orgId: string, pipeId: string) {
  return (await db.select().from(pipes).where(and(eq(pipes.id, pipeId), eq(pipes.orgId, orgId), isNull(pipes.deletedAt))).limit(1))[0] ?? null;
}
const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

biRoutes.get("/public/bi/:token/pipes", limit, async (req, res) => {
  const orgId = await orgOf(String(req.params.token));
  if (!orgId) return res.status(404).json({ error: "Chave inválida." });
  const rows = await db.select({ id: pipes.id, name: pipes.name }).from(pipes).where(and(eq(pipes.orgId, orgId), isNull(pipes.deletedAt))).orderBy(asc(pipes.name));
  const base = biUrl(String(req.params.token));
  res.json(rows.map((p) => ({ pipe: p.name, cards_url: `${base}/pipes/${p.id}/cards`, phase_history_url: `${base}/pipes/${p.id}/phase-history` })));
});

biRoutes.get("/public/bi/:token/pipes/:pipeId/cards", limit, async (req, res) => {
  const orgId = await orgOf(String(req.params.token));
  const pipe = orgId ? await pipeOf(orgId, String(req.params.pipeId)) : null;
  if (!pipe) return res.status(404).json({ error: "Chave ou pipe inválido." });
  const [rows, defs, ph] = await Promise.all([
    db.select().from(cards).where(and(eq(cards.pipeId, pipe.id), isNull(cards.deletedAt))),
    db.select().from(fields).where(and(eq(fields.pipeId, pipe.id), isNull(fields.archivedAt))),
    db.select({ id: phases.id, name: phases.name }).from(phases).where(eq(phases.pipeId, pipe.id)),
  ]);
  const ids = rows.map((c) => c.id);
  const [vals, asg, lbl] = ids.length ? await Promise.all([
    db.select().from(cardFields).where(inArray(cardFields.cardId, ids)),
    db.select({ cardId: cardAssignees.cardId, name: users.name, email: users.email }).from(cardAssignees).innerJoin(users, eq(users.id, cardAssignees.userId)).where(inArray(cardAssignees.cardId, ids)),
    db.select({ cardId: cardLabels.cardId, name: labels.name }).from(cardLabels).innerJoin(labels, eq(labels.id, cardLabels.labelId)).where(inArray(cardLabels.cardId, ids)),
  ]) : [[], [], []];
  // Ids inside list values → readable names.
  const listIds = vals.flatMap((v) => (Array.isArray(v.value) ? (v.value as string[]) : []));
  const [people, lbls, recs, linked] = listIds.length ? await Promise.all([
    db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, listIds)),
    db.select({ id: labels.id, name: labels.name }).from(labels).where(inArray(labels.id, listIds)),
    db.select({ id: tableRecords.id, title: tableRecords.title }).from(tableRecords).where(inArray(tableRecords.id, listIds)),
    db.select({ id: cards.id, number: cards.number }).from(cards).where(inArray(cards.id, listIds)),
  ]) : [[], [], [], []];
  const name = (id: string) => people.find((p) => p.id === id)?.name ?? lbls.find((l) => l.id === id)?.name ?? recs.find((r) => r.id === id)?.title ?? (() => { const c = linked.find((x) => x.id === id); return c ? `#${c.number}` : id; })();
  const usable = defs.filter((d) => !["attachment", "id"].includes(d.type));
  // Two fields with the same label get the phase appended, so columns stay unique.
  const colName = (d: (typeof defs)[number]) => (usable.filter((x) => x.label === d.label).length > 1 ? `${d.label} (${ph.find((p) => p.id === d.phaseId)?.name})` : d.label);

  res.json(rows.map((c) => {
    const row: Record<string, unknown> = {
      numero: c.number, titulo: c.title, fase: ph.find((p) => p.id === c.currentPhaseId)?.name ?? null, concluido: c.done,
      criado_em: iso(c.createdAt), atualizado_em: iso(c.updatedAt), vencimento: iso(c.dueDate),
      atrasado_em: iso(c.lateAt), expirado_em: iso(c.expiredAt), vencido_em: iso(c.overdueAt),
      responsaveis: asg.filter((a) => a.cardId === c.id).map((a) => a.name ?? a.email).join(", "),
      etiquetas: lbl.filter((l) => l.cardId === c.id).map((l) => l.name).join(", "),
    };
    for (const d of usable) {
      const v = vals.find((x) => x.cardId === c.id && x.fieldId === d.id)?.value;
      row[colName(d)] = v === undefined ? null : Array.isArray(v) ? (v as string[]).map(name).join(", ") : v;
    }
    return row;
  }));
});

biRoutes.get("/public/bi/:token/pipes/:pipeId/phase-history", limit, async (req, res) => {
  const orgId = await orgOf(String(req.params.token));
  const pipe = orgId ? await pipeOf(orgId, String(req.params.pipeId)) : null;
  if (!pipe) return res.status(404).json({ error: "Chave ou pipe inválido." });
  const cal = pipe.businessHoursOnly ? await calendarOf(pipe.orgId) : null;
  const rows = await db.select({ number: cards.number, title: cards.title, phase: phases.name, enteredAt: cardPhaseHistory.enteredAt, leftAt: cardPhaseHistory.leftAt, becameLate: cardPhaseHistory.becameLate })
    .from(cardPhaseHistory).innerJoin(cards, eq(cards.id, cardPhaseHistory.cardId)).innerJoin(phases, eq(phases.id, cardPhaseHistory.phaseId))
    .where(and(eq(cards.pipeId, pipe.id), isNull(cards.deletedAt))).orderBy(asc(cardPhaseHistory.enteredAt));
  const now = new Date();
  res.json(rows.map((r) => ({
    numero: r.number, titulo: r.title, fase: r.phase, entrou_em: iso(r.enteredAt), saiu_em: iso(r.leftAt),
    minutos: businessMinutesBetween(r.enteredAt, r.leftAt ?? now, cal), horario_util: !!cal, atrasou: r.becameLate, em_andamento: !r.leftAt,
  })));
});
