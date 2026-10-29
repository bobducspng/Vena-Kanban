import { and, eq, inArray, isNull } from "drizzle-orm";
import { db } from "./db/client.js";
import { cardAssignees, cardFields, cards, fields, labels, cardLabels, phases, pipes, users } from "./db/schema.js";
import { env } from "./env.js";
import { cardContext } from "./templates.js";

/**
 * A card as other systems see it (API responses and webhook payloads): ids, phase,
 * people by e-mail, and every field with its raw value and its text the Brazilian way.
 */
export async function cardSnapshot(cardId: string) {
  const c = (await db.select().from(cards).where(eq(cards.id, cardId)).limit(1))[0];
  if (!c) return null;
  const [pipe, phase, defs, vals, people, lbls, ctx] = await Promise.all([
    db.select({ id: pipes.id, name: pipes.name }).from(pipes).where(eq(pipes.id, c.pipeId)).limit(1),
    db.select({ id: phases.id, name: phases.name, isEnd: phases.isEnd }).from(phases).where(eq(phases.id, c.currentPhaseId)).limit(1),
    db.select({ id: fields.id, label: fields.label, type: fields.type, phaseId: fields.phaseId }).from(fields).where(and(eq(fields.pipeId, c.pipeId), isNull(fields.archivedAt))),
    db.select().from(cardFields).where(eq(cardFields.cardId, c.id)),
    db.select({ email: users.email, name: users.name }).from(cardAssignees).innerJoin(users, eq(users.id, cardAssignees.userId)).where(eq(cardAssignees.cardId, c.id)),
    db.select({ name: labels.name }).from(cardLabels).innerJoin(labels, eq(labels.id, cardLabels.labelId)).where(eq(cardLabels.cardId, c.id)),
    cardContext(c.id),
  ]);
  const value = new Map(vals.map((v) => [v.fieldId, v.value]));
  return {
    id: c.id,
    number: c.number,
    title: c.title,
    pipe: pipe[0] ?? null,
    phase: phase[0] ? { id: phase[0].id, name: phase[0].name } : null,
    done: c.done,
    dueDate: c.dueDate,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    deleted: !!c.deletedAt,
    url: `${env.PUBLIC_BASE_URL}/pipes/${c.pipeId}?card=${c.id}`,
    assignees: people,
    labels: lbls.map((l) => l.name),
    fields: defs.filter((d) => !["attachment"].includes(d.type)).map((d) => ({
      id: d.id, label: d.label, type: d.type, value: value.get(d.id) ?? null, text: ctx.fill(`{${d.label}}`),
    })),
  };
}
export type CardSnapshot = NonNullable<Awaited<ReturnType<typeof cardSnapshot>>>;

export async function cardSnapshots(ids: string[]) {
  if (!ids.length) return [];
  const exist = await db.select({ id: cards.id }).from(cards).where(inArray(cards.id, ids));
  const out: CardSnapshot[] = [];
  for (const { id } of exist) { const s = await cardSnapshot(id); if (s) out.push(s); }
  return out;
}
