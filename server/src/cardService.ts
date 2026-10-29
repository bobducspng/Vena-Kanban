import { eq, and, inArray, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "./db/client.js";
import {
  cards, cardFields, cardAssignees, cardLabels, cardEvents, fields, phases, phaseTransitions, phaseAssignees,
  pipes, checklistItems, comments, attachments, fieldConditions, cardPhaseHistory,
} from "./db/schema.js";
import { isEmpty, validateValue, applySideEffects } from "./fieldRules.js";
import { fieldStates, mustFill, type ConditionDef } from "./conditions.js";
import { autofillValues, readSettings, finishBlocker } from "./connections.js";
import { notifyAssigned } from "./notify.js";
import { asSystem } from "./access.js";
import { recomputeFormulas } from "./formulaFields.js";

/**
 * Card operations shared by the API (people) and the automation engine.
 * Same rules either way: required fields, conditionals, pai/filho, autofill,
 * side effects, phase assignees, activity log. Each operation announces what
 * happened through `cardEvents` listeners (the automation engine subscribes).
 */

// --- events for automations ---------------------------------------------------
export type CardEventKind = "card_created" | "card_entered_phase" | "card_left_phase" | "field_updated" | "alert";
export interface CardHappening {
  kind: CardEventKind;
  cardId: string;
  pipeId: string;
  phaseId?: string; // entered/left phase, or the phase a card was created in
  fieldId?: string; // field_updated
  alertKind?: "late" | "expired" | "overdue"; // alert
  /** Automation chain depth (0 = a person did it). Stops runaway loops. */
  depth: number;
}
type Listener = (e: CardHappening) => Promise<void>;
const listeners: Listener[] = [];
/** The automation engine and the webhooks register here (avoids an import cycle). */
export function onCardHappening(fn: Listener) { listeners.push(fn); }
async function announce(e: CardHappening) {
  // depth -1 = quiet (planilha importada sem automações): nothing fires.
  if (e.depth < 0) return;
  for (const fn of listeners) {
    try { await asSystem(() => fn(e)); } catch (err) { console.error("card listener failed:", err); }
  }
}
/** For alerts raised by the SLA sweep. */
export const announceHappening = announce;

/** Who did it: a person (userId), an automation (rule name) or an outside channel
 *  (`via`, e.g. "Formulário público") — for the activity log. */
/** depth: 0 = a person, n = nth automation in a chain, -1 = quiet (no automations run). */
export interface Actor { userId: string | null; automation?: string; via?: string; depth: number }
const eventData = (a: Actor, extra?: Record<string, unknown>) =>
  a.automation || a.via ? { ...(extra ?? {}), ...(a.automation ? { automation: a.automation } : {}), ...(a.via ? { via: a.via } : {}) } : extra ?? null;

// --- shaping -------------------------------------------------------------------
type Extra = {
  values: { fieldId: string; value: unknown }[]; assigneeIds: string[]; labelIds: string[];
  checklistDone: number; checklistTotal: number; commentCount: number; attachmentCount: number;
};
/** values[], assigneeIds[], labels and counters per card — matches the front-end type. */
export async function hydrate(cardIds: string[]) {
  const map = new Map<string, Extra>();
  if (cardIds.length === 0) return map;
  const [vals, asg, lbl, chk, cmt, att] = await Promise.all([
    db.select().from(cardFields).where(inArray(cardFields.cardId, cardIds)),
    db.select().from(cardAssignees).where(inArray(cardAssignees.cardId, cardIds)),
    db.select().from(cardLabels).where(inArray(cardLabels.cardId, cardIds)),
    db.select({ cardId: checklistItems.cardId, done: checklistItems.done }).from(checklistItems).where(inArray(checklistItems.cardId, cardIds)),
    db.select({ cardId: comments.cardId }).from(comments).where(inArray(comments.cardId, cardIds)),
    db.select({ cardId: attachments.cardId }).from(attachments).where(inArray(attachments.cardId, cardIds)),
  ]);
  cardIds.forEach((id) => map.set(id, { values: [], assigneeIds: [], labelIds: [], checklistDone: 0, checklistTotal: 0, commentCount: 0, attachmentCount: 0 }));
  vals.forEach((v) => map.get(v.cardId)!.values.push({ fieldId: v.fieldId, value: v.value }));
  asg.forEach((a) => map.get(a.cardId)!.assigneeIds.push(a.userId));
  lbl.forEach((l) => map.get(l.cardId)!.labelIds.push(l.labelId));
  chk.forEach((c) => { const e = map.get(c.cardId)!; e.checklistTotal++; if (c.done) e.checklistDone++; });
  cmt.forEach((c) => map.get(c.cardId)!.commentCount++);
  att.forEach((a) => { if (a.cardId) map.get(a.cardId)!.attachmentCount++; });
  return map;
}

/** One card, shaped for the front-end. */
export async function shaped(cardId: string) {
  const row = (await db.select().from(cards).where(eq(cards.id, cardId)).limit(1))[0];
  const h = await hydrate([cardId]);
  return { ...row, ...h.get(cardId)! };
}

// --- helpers -------------------------------------------------------------------
/** Responsáveis da fase: entering a phase adds its people; leaving removes them. */
export async function syncPhaseAssignees(cardId: string, fromPhaseId: string | null, toPhaseId: string) {
  if (fromPhaseId) {
    const leaving = (await db.select().from(phaseAssignees).where(eq(phaseAssignees.phaseId, fromPhaseId))).map((a) => a.userId);
    if (leaving.length) await db.delete(cardAssignees).where(and(eq(cardAssignees.cardId, cardId), inArray(cardAssignees.userId, leaving)));
  }
  const entering = (await db.select().from(phaseAssignees).where(eq(phaseAssignees.phaseId, toPhaseId))).map((a) => a.userId);
  if (entering.length) {
    const have = new Set((await db.select().from(cardAssignees).where(eq(cardAssignees.cardId, cardId))).map((a) => a.userId));
    const add = entering.filter((u) => !have.has(u));
    if (add.length) {
      await db.insert(cardAssignees).values(add.map((userId) => ({ cardId, userId })));
      const phase = (await db.select({ name: phases.name }).from(phases).where(eq(phases.id, toPhaseId)).limit(1))[0];
      await notifyAssigned(add, cardId, { phase: phase?.name });
    }
  }
}

/** Labels of the phase's fields that must be filled (required and visible after the
 *  phase's conditionals) but are empty. `skipTypes` = types not checked here. */
export async function missingInPhase(phaseId: string, values: { fieldId: string; value: unknown }[], skipTypes: string[] = []) {
  const phaseFields = await db.select().from(fields).where(and(eq(fields.phaseId, phaseId), isNull(fields.archivedAt)));
  const conds = (await db.select().from(fieldConditions).where(eq(fieldConditions.phaseId, phaseId))) as unknown as ConditionDef[];
  const byId = Object.fromEntries(values.map((v) => [v.fieldId, v.value])) as Parameters<typeof fieldStates>[2];
  const states = fieldStates(phaseFields, conds, byId);
  return phaseFields
    .filter((f) => !skipTypes.includes(f.type) && mustFill(states.get(f.id)))
    .filter((f) => { const v = byId[f.id]; return isEmpty(v) || v === false; })
    .map((f) => f.label);
}

/** Upsert values on a card (no validation: autofill copies) and apply their side effects. */
export async function writeValues(cardId: string, values: Map<string, unknown>) {
  if (!values.size) return;
  const defs = await db.select().from(fields).where(inArray(fields.id, [...values.keys()]));
  for (const [fieldId, value] of values) {
    const existing = (await db.select().from(cardFields).where(and(eq(cardFields.cardId, cardId), eq(cardFields.fieldId, fieldId))).limit(1))[0];
    if (existing) await db.update(cardFields).set({ value, filledAt: new Date() }).where(eq(cardFields.id, existing.id));
    else await db.insert(cardFields).values({ id: crypto.randomUUID(), cardId, fieldId, value, filledAt: new Date() });
    const def = defs.find((d) => d.id === fieldId);
    if (def) await applySideEffects(def, cardId, value);
  }
}

/** Autofill of a connection field from its first connected item. */
export async function autofillFor(field: typeof fields.$inferSelect, ids: unknown) {
  const s = readSettings(field.settings);
  const first = Array.isArray(ids) ? (ids[0] as string | undefined) : undefined;
  return s && first ? autofillValues(s, first) : new Map<string, unknown>();
}

/** Title shown for a value of the pipe's title field. */
export const titleOf = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v).slice(0, 512));

const missingError = (missing: string[]) =>
  new TRPCError({ code: "BAD_REQUEST", message: `Preencha os campos obrigatórios: ${missing.join(", ")}` });

// --- operations ----------------------------------------------------------------
/** Create a card from start-form values. Returns its id. */
export async function createCard(input: {
  pipeId: string; phaseId?: string; title: string; values: { fieldId: string; value: unknown }[]; orgId: string; actor: Actor;
  /** Field types not required here (e.g. the public form cannot fill connections): the team completes them. */
  skipRequiredTypes?: string[];
}): Promise<string> {
  const start = (await db.select().from(phases).where(and(eq(phases.pipeId, input.pipeId), eq(phases.isStart, true))).limit(1))[0];
  if (!start) throw new TRPCError({ code: "BAD_REQUEST", message: "Pipe sem fase inicial" });
  let landing = start;
  if (input.phaseId && input.phaseId !== start.id) {
    const ph = (await db.select().from(phases).where(eq(phases.id, input.phaseId)).limit(1))[0];
    if (!ph || ph.pipeId !== input.pipeId || !ph.canCreateCard) throw new TRPCError({ code: "BAD_REQUEST", message: "Esta fase não permite criar cards" });
    landing = ph;
  }

  // Autofill from connected items (start-form connections), unless a value was given.
  const pipeFields = await db.select().from(fields).where(eq(fields.pipeId, input.pipeId));
  const typed = new Map(input.values.map((v) => [v.fieldId, v.value]));
  const filled = new Map<string, unknown>();
  for (const v of input.values) {
    const f = pipeFields.find((x) => x.id === v.fieldId);
    if (f?.type !== "connection") continue;
    for (const [to, val] of await autofillFor(f, v.value)) if (isEmpty(typed.get(to))) filled.set(to, val);
  }
  const allValues = [...input.values, ...[...filled].map(([fieldId, value]) => ({ fieldId, value }))];
  // Attachments can only be added after the card exists: checked when it leaves the phase.
  const missing = await missingInPhase(start.id, allValues, ["attachment", "id", "formula", ...(input.skipRequiredTypes ?? [])]);
  if (missing.length) throw missingError(missing);
  // Only start-phase fields can be filled on creation.
  const startFields = await db.select().from(fields).where(and(eq(fields.phaseId, start.id), isNull(fields.archivedAt)));
  for (const v of input.values) {
    const f = startFields.find((x) => x.id === v.fieldId);
    if (!f) throw new TRPCError({ code: "BAD_REQUEST", message: "Campo não pertence ao formulário inicial" });
    await validateValue(f, v.value, input.orgId);
  }

  // Pipe's title field (if set) names the card.
  const pipe = (await db.select({ titleFieldId: pipes.titleFieldId }).from(pipes).where(eq(pipes.id, input.pipeId)).limit(1))[0];
  const titleFromField = pipe?.titleFieldId ? titleOf(allValues.find((v) => v.fieldId === pipe.titleFieldId)?.value) : null;

  const cardId = crypto.randomUUID();
  await db.transaction(async (tx) => {
    await tx.insert(cards).values({
      id: cardId, pipeId: input.pipeId, currentPhaseId: landing.id, done: landing.isEnd,
      title: titleFromField ?? (input.title || "(sem título)"), createdBy: input.actor.userId, phaseEnteredAt: new Date(),
    });
    await tx.insert(cardPhaseHistory).values({ id: crypto.randomUUID(), cardId, phaseId: landing.id, enteredAt: new Date() });
    for (const v of input.values) {
      await tx.insert(cardFields).values({ id: crypto.randomUUID(), cardId, fieldId: v.fieldId, value: v.value, filledAt: isEmpty(v.value) ? null : new Date() });
    }
    await tx.insert(cardEvents).values({ id: crypto.randomUUID(), cardId, type: "created", actorId: input.actor.userId, data: eventData(input.actor) });
  });
  for (const v of input.values) await applySideEffects(startFields.find((x) => x.id === v.fieldId)!, cardId, v.value);
  await writeValues(cardId, filled);
  await syncPhaseAssignees(cardId, null, landing.id);

  await recomputeFormulas(cardId);
  await announce({ kind: "card_created", cardId, pipeId: input.pipeId, phaseId: landing.id, depth: input.actor.depth });
  await announce({ kind: "card_entered_phase", cardId, pipeId: input.pipeId, phaseId: landing.id, depth: input.actor.depth });
  return cardId;
}

/** Set one field's value. `checkEditable` = the person rules (no future phase;
 *  past phase only if "editável em outras fases"); automations skip it. */
export async function setFieldValue(input: {
  card: typeof cards.$inferSelect; fieldId: string; value: unknown; orgId: string; actor: Actor; checkEditable: boolean;
}) {
  const { card } = input;
  const field = (await db.select().from(fields).where(eq(fields.id, input.fieldId)).limit(1))[0];
  if (!field || field.pipeId !== card.pipeId || field.archivedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Campo inválido" });
  if (input.checkEditable && field.phaseId !== card.currentPhaseId) {
    const ph = await db.select({ id: phases.id, position: phases.position }).from(phases).where(eq(phases.pipeId, card.pipeId));
    const pos = (id: string) => ph.find((x) => x.id === id)?.position ?? 0;
    if (pos(field.phaseId) > pos(card.currentPhaseId)) {
      throw new TRPCError({ code: "FORBIDDEN", message: `"${field.label}" é de uma fase que o card ainda não alcançou.` });
    }
    if (!field.editableOtherPhases) throw new TRPCError({ code: "FORBIDDEN", message: `"${field.label}" só pode ser editado na fase dele.` });
  }
  await validateValue(field, input.value, input.orgId, card.id);

  const existing = (await db.select().from(cardFields).where(and(eq(cardFields.cardId, card.id), eq(cardFields.fieldId, field.id))).limit(1))[0];
  const before = Array.isArray(existing?.value) ? (existing!.value as string[])[0] : undefined;
  const after = Array.isArray(input.value) ? input.value[0] : undefined;
  const filledAt = isEmpty(input.value) ? null : new Date();
  if (existing) await db.update(cardFields).set({ value: input.value, filledAt }).where(eq(cardFields.id, existing.id));
  else await db.insert(cardFields).values({ id: crypto.randomUUID(), cardId: card.id, fieldId: field.id, value: input.value, filledAt });
  await applySideEffects(field, card.id, input.value);
  if (field.type === "connection" && after && after !== before) await writeValues(card.id, await autofillFor(field, input.value));
  const pipe = (await db.select({ titleFieldId: pipes.titleFieldId }).from(pipes).where(eq(pipes.id, card.pipeId)).limit(1))[0];
  const newTitle = pipe?.titleFieldId === field.id ? titleOf(input.value) : null;
  if (newTitle && newTitle !== card.title) await db.update(cards).set({ title: newTitle }).where(eq(cards.id, card.id));
  await db.insert(cardEvents).values({ id: crypto.randomUUID(), cardId: card.id, type: "field_updated", actorId: input.actor.userId, data: eventData(input.actor, { fieldId: field.id }) });

  await recomputeFormulas(card.id);
  await announce({ kind: "field_updated", cardId: card.id, pipeId: card.pipeId, fieldId: field.id, depth: input.actor.depth });
}

/** Move a card. People are bound to "Mover para" (`checkTransition`); automations are not.
 *  Both are bound to required fields and pai/filho rules. `version` = optimistic lock. */
export async function moveCard(input: {
  card: typeof cards.$inferSelect; toPhaseId: string; actor: Actor; checkTransition: boolean; version?: number;
}) {
  const { card } = input;
  const to = (await db.select().from(phases).where(eq(phases.id, input.toPhaseId)).limit(1))[0];
  if (!to || to.pipeId !== card.pipeId) throw new TRPCError({ code: "BAD_REQUEST", message: "Fase destino inválida" });
  if (to.id === card.currentPhaseId) return;
  if (input.checkTransition) {
    const link = (await db.select().from(phaseTransitions)
      .where(and(eq(phaseTransitions.fromPhaseId, card.currentPhaseId), eq(phaseTransitions.toPhaseId, to.id))).limit(1))[0];
    if (!link) throw new TRPCError({ code: "FORBIDDEN", message: `Não é permitido mover deste ponto para "${to.name}".` });
  }
  // Pai/filho: concluding may require connected (child) cards, or all of them concluded.
  if (to.isEnd) {
    const blocker = await finishBlocker(card.id, card.pipeId);
    if (blocker) throw new TRPCError({ code: "BAD_REQUEST", message: blocker });
  }
  // Required-field gate on the phase being left.
  const vals = await db.select().from(cardFields).where(eq(cardFields.cardId, card.id));
  const missing = await missingInPhase(card.currentPhaseId, vals.map((v) => ({ fieldId: v.fieldId, value: v.value })));
  if (missing.length) throw missingError(missing);

  const whereCard = input.version === undefined ? eq(cards.id, card.id) : and(eq(cards.id, card.id), eq(cards.version, input.version));
  // A new phase starts a new phase clock (late clears; expiration keeps counting from creation).
  const res = await db.update(cards)
    .set({ currentPhaseId: to.id, done: to.isEnd, phaseEnteredAt: new Date(), lateAt: null, late: false, version: sql`${cards.version} + 1` })
    .where(whereCard);
  // mysql2 returns affectedRows via the result header.
  const affected = (res as unknown as [{ affectedRows: number }])[0]?.affectedRows ?? 1;
  if (affected === 0) throw new TRPCError({ code: "CONFLICT", message: "O card foi alterado por outra pessoa. Recarregue." });

  await db.insert(cardEvents).values({
    id: crypto.randomUUID(), cardId: card.id, type: "moved", fromPhaseId: card.currentPhaseId, toPhaseId: to.id,
    actorId: input.actor.userId, data: eventData(input.actor),
  });
  await db.update(cardPhaseHistory).set({ leftAt: new Date() }).where(and(eq(cardPhaseHistory.cardId, card.id), isNull(cardPhaseHistory.leftAt)));
  await db.insert(cardPhaseHistory).values({ id: crypto.randomUUID(), cardId: card.id, phaseId: to.id, enteredAt: new Date() });
  await syncPhaseAssignees(card.id, card.currentPhaseId, to.id);

  await announce({ kind: "card_left_phase", cardId: card.id, pipeId: card.pipeId, phaseId: card.currentPhaseId, depth: input.actor.depth });
  await announce({ kind: "card_entered_phase", cardId: card.id, pipeId: card.pipeId, phaseId: to.id, depth: input.actor.depth });
}
