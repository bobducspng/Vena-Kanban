import { z } from "zod";
import { eq, and, inArray, isNull, isNotNull, desc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../../db/client.js";
import { cards, cardFields, cardAssignees, cardLabels, cardEvents, fields, phases, phaseTransitions, phaseAssignees, pipes, labels, memberships, checklistItems, comments, attachments, fieldConditions } from "../../db/schema.js";
import { cardInOrg, logEvent } from "../cardAccess.js";
import { isEmpty, validateValue, applySideEffects } from "../../fieldRules.js";
import { fieldStates, mustFill, type ConditionDef } from "../../conditions.js";
import { autofillValues, readSettings, linkedFrom, finishBlocker } from "../../connections.js";
import { router, protectedProcedure, assertPipeInOrg } from "../trpc.js";

// Lists hold checklist options, user ids (responsáveis) or label ids (etiquetas).
const valueSchema = z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string().max(255)).max(200)]);

// Shape a card row with its values[] and assigneeIds[] — matches the front-end type.
type Extra = {
  values: { fieldId: string; value: unknown }[]; assigneeIds: string[]; labelIds: string[];
  checklistDone: number; checklistTotal: number; commentCount: number; attachmentCount: number;
};
async function hydrate(cardIds: string[]) {
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

/** Responsáveis da fase: entering a phase adds its people; leaving removes them. */
async function syncPhaseAssignees(cardId: string, fromPhaseId: string | null, toPhaseId: string) {
  if (fromPhaseId) {
    const leaving = (await db.select().from(phaseAssignees).where(eq(phaseAssignees.phaseId, fromPhaseId))).map((a) => a.userId);
    if (leaving.length) await db.delete(cardAssignees).where(and(eq(cardAssignees.cardId, cardId), inArray(cardAssignees.userId, leaving)));
  }
  const entering = (await db.select().from(phaseAssignees).where(eq(phaseAssignees.phaseId, toPhaseId))).map((a) => a.userId);
  if (entering.length) {
    const have = new Set((await db.select().from(cardAssignees).where(eq(cardAssignees.cardId, cardId))).map((a) => a.userId));
    const add = entering.filter((u) => !have.has(u));
    if (add.length) await db.insert(cardAssignees).values(add.map((userId) => ({ cardId, userId })));
  }
}

/** Labels of the phase's fields that must be filled (required and visible after the
 *  phase's conditionals) but are empty. `skipTypes` = types not checked here. */
async function missingInPhase(phaseId: string, values: { fieldId: string; value: unknown }[], skipTypes: string[] = []) {
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
async function writeValues(cardId: string, values: Map<string, unknown>) {
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
async function autofillFor(field: typeof fields.$inferSelect, ids: unknown) {
  const s = readSettings(field.settings);
  const first = Array.isArray(ids) ? (ids[0] as string | undefined) : undefined;
  return s && first ? autofillValues(s, first) : new Map<string, unknown>();
}

/** Title shown for a value of the pipe's title field. */
const titleOf = (v: unknown) => (v === null || v === undefined || v === "" ? null : String(v).slice(0, 512));

/** One card, shaped for the front-end. */
async function shaped(cardId: string) {
  const row = (await db.select().from(cards).where(eq(cards.id, cardId)).limit(1))[0];
  const h = await hydrate([cardId]);
  return { ...row, ...h.get(cardId)! };
}

export const cardRouter = router({
  listByPipe: protectedProcedure.input(z.object({ pipeId: z.string() })).query(async ({ ctx, input }) => {
    await assertPipeInOrg(input.pipeId, ctx.orgId);
    const rows = await db.select().from(cards).where(and(eq(cards.pipeId, input.pipeId), isNull(cards.deletedAt)));
    const h = await hydrate(rows.map((r) => r.id));
    return rows.map((r) => ({ ...r, ...h.get(r.id)! }));
  }),

  get: protectedProcedure.input(z.object({ cardId: z.string() })).query(async ({ ctx, input }) => {
    const row = (await db.select().from(cards).where(eq(cards.id, input.cardId)).limit(1))[0];
    if (!row || row.deletedAt) return null;
    await assertPipeInOrg(row.pipeId, ctx.orgId);
    const h = await hydrate([row.id]);
    return { ...row, ...h.get(row.id)! };
  }),

  create: protectedProcedure
    .input(z.object({
      pipeId: z.string(),
      // Optional landing phase: the start phase (default) or one that allows creating cards.
      phaseId: z.string().optional(),
      title: z.string().max(512),
      values: z.array(z.object({ fieldId: z.string(), value: valueSchema })),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPipeInOrg(input.pipeId, ctx.orgId);
      const start = (await db.select().from(phases)
        .where(and(eq(phases.pipeId, input.pipeId), eq(phases.isStart, true))).limit(1))[0];
      if (!start) throw new TRPCError({ code: "BAD_REQUEST", message: "Pipe sem fase inicial" });
      let landing = start;
      if (input.phaseId && input.phaseId !== start.id) {
        const ph = (await db.select().from(phases).where(eq(phases.id, input.phaseId)).limit(1))[0];
        if (!ph || ph.pipeId !== input.pipeId || !ph.canCreateCard) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Esta fase não permite criar cards" });
        }
        landing = ph;
      }

      // Autofill from connected items (start-form connections), unless the user typed a value.
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
      const missing = await missingInPhase(start.id, allValues, ["attachment", "id"]);
      if (missing.length) throw new TRPCError({ code: "BAD_REQUEST", message: `Preencha os campos obrigatórios: ${missing.join(", ")}` });
      // Only start-phase fields can be filled on creation.
      const startFields = await db.select().from(fields).where(and(eq(fields.phaseId, start.id), isNull(fields.archivedAt)));
      for (const v of input.values) {
        const f = startFields.find((x) => x.id === v.fieldId);
        if (!f) throw new TRPCError({ code: "BAD_REQUEST", message: "Campo não pertence ao formulário inicial" });
        await validateValue(f, v.value, ctx.orgId);
      }

      // Pipe's title field (if set) names the card.
      const pipe = (await db.select({ titleFieldId: pipes.titleFieldId }).from(pipes).where(eq(pipes.id, input.pipeId)).limit(1))[0];
      const titleFromField = pipe?.titleFieldId ? titleOf(input.values.find((v) => v.fieldId === pipe.titleFieldId)?.value) : null;

      return db.transaction(async (tx) => {
        const cardId = crypto.randomUUID();
        await tx.insert(cards).values({
          id: cardId, pipeId: input.pipeId, currentPhaseId: landing.id, done: landing.isEnd,
          title: titleFromField ?? (input.title || "(sem título)"), createdBy: ctx.userId,
        });
        for (const v of input.values) {
          await tx.insert(cardFields).values({
            id: crypto.randomUUID(), cardId, fieldId: v.fieldId, value: v.value,
            filledAt: isEmpty(v.value) ? null : new Date(),
          });
        }
        await tx.insert(cardEvents).values({ id: crypto.randomUUID(), cardId, type: "created", actorId: ctx.userId });
        return cardId;
      }).then(async (cardId) => {
        for (const v of input.values) await applySideEffects(startFields.find((x) => x.id === v.fieldId)!, cardId, v.value);
        await writeValues(cardId, filled as Map<string, never>);
        await syncPhaseAssignees(cardId, null, landing.id);
        return shaped(cardId);
      });
    }),

  updateField: protectedProcedure
    .input(z.object({ cardId: z.string(), fieldId: z.string(), value: valueSchema }))
    .mutation(async ({ ctx, input }) => {
      const card = await cardInOrg(input.cardId, ctx.orgId);

      // Editability: never a future phase's field; a past phase's only if "editável em outras fases".
      const field = (await db.select().from(fields).where(eq(fields.id, input.fieldId)).limit(1))[0];
      if (!field || field.pipeId !== card.pipeId || field.archivedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Campo inválido" });
      if (field.phaseId !== card.currentPhaseId) {
        const ph = await db.select({ id: phases.id, position: phases.position }).from(phases).where(eq(phases.pipeId, card.pipeId));
        const pos = (id: string) => ph.find((x) => x.id === id)?.position ?? 0;
        if (pos(field.phaseId) > pos(card.currentPhaseId)) {
          throw new TRPCError({ code: "FORBIDDEN", message: `"${field.label}" é de uma fase que o card ainda não alcançou.` });
        }
        if (!field.editableOtherPhases) {
          throw new TRPCError({ code: "FORBIDDEN", message: `"${field.label}" só pode ser editado na fase dele.` });
        }
      }
      await validateValue(field, input.value, ctx.orgId, card.id);

      const existing = (await db.select().from(cardFields)
        .where(and(eq(cardFields.cardId, input.cardId), eq(cardFields.fieldId, input.fieldId))).limit(1))[0];
      const before = Array.isArray(existing?.value) ? (existing!.value as string[])[0] : undefined;
      const after = Array.isArray(input.value) ? input.value[0] : undefined;
      const filledAt = isEmpty(input.value) ? null : new Date();
      if (existing) {
        await db.update(cardFields).set({ value: input.value, filledAt })
          .where(eq(cardFields.id, existing.id));
      } else {
        await db.insert(cardFields).values({ id: crypto.randomUUID(), cardId: input.cardId, fieldId: input.fieldId, value: input.value, filledAt });
      }
      await applySideEffects(field, card.id, input.value);
      if (field.type === "connection" && after && after !== before) {
        await writeValues(card.id, await autofillFor(field, input.value) as Map<string, never>);
      }
      const pipe = (await db.select({ titleFieldId: pipes.titleFieldId }).from(pipes).where(eq(pipes.id, card.pipeId)).limit(1))[0];
      const newTitle = pipe?.titleFieldId === field.id ? titleOf(input.value) : null;
      if (newTitle && newTitle !== card.title) await db.update(cards).set({ title: newTitle }).where(eq(cards.id, card.id));
      await logEvent(card.id, "field_updated", ctx.userId, { fieldId: field.id });
      return shaped(card.id);
    }),

  move: protectedProcedure
    .input(z.object({ cardId: z.string(), toPhaseId: z.string(), version: z.number().int().optional() }))
    .mutation(async ({ ctx, input }) => {
      const card = await cardInOrg(input.cardId, ctx.orgId);

      const to = (await db.select().from(phases).where(eq(phases.id, input.toPhaseId)).limit(1))[0];
      if (!to || to.pipeId !== card.pipeId) throw new TRPCError({ code: "BAD_REQUEST", message: "Fase destino inválida" });
      // "Mover para": only phases this phase is linked to (manual moves; automations will bypass).
      const link = (await db.select().from(phaseTransitions)
        .where(and(eq(phaseTransitions.fromPhaseId, card.currentPhaseId), eq(phaseTransitions.toPhaseId, to.id))).limit(1))[0];
      if (!link) throw new TRPCError({ code: "FORBIDDEN", message: `Não é permitido mover deste ponto para "${to.name}".` });
      // Pai/filho: concluding may require connected (child) cards, or all of them concluded.
      if (to.isEnd) {
        const blocker = await finishBlocker(card.id, card.pipeId);
        if (blocker) throw new TRPCError({ code: "BAD_REQUEST", message: blocker });
      }

      // Required-field gate on the phase being left.
      const vals = await db.select().from(cardFields).where(eq(cardFields.cardId, card.id));
      const missing = await missingInPhase(card.currentPhaseId, vals.map((v) => ({ fieldId: v.fieldId, value: v.value })));
      if (missing.length) throw new TRPCError({ code: "BAD_REQUEST", message: `Preencha os campos obrigatórios: ${missing.join(", ")}` });

      // Optimistic lock: only move if version matches (when the client sent one).
      const whereCard = input.version === undefined
        ? eq(cards.id, card.id)
        : and(eq(cards.id, card.id), eq(cards.version, input.version));
      const res = await db.update(cards)
        .set({ currentPhaseId: to.id, done: to.isEnd, version: sql`${cards.version} + 1` })
        .where(whereCard);
      // mysql2 returns affectedRows via the result header.
      const affected = (res as unknown as [{ affectedRows: number }])[0]?.affectedRows ?? 1;
      if (affected === 0) throw new TRPCError({ code: "CONFLICT", message: "O card foi alterado por outra pessoa. Recarregue." });

      await db.insert(cardEvents).values({ id: crypto.randomUUID(), cardId: card.id, type: "moved", fromPhaseId: card.currentPhaseId, toPhaseId: to.id, actorId: ctx.userId });
      await syncPhaseAssignees(card.id, card.currentPhaseId, to.id);
      const h = await hydrate([card.id]);
      const row = (await db.select().from(cards).where(eq(cards.id, card.id)).limit(1))[0];
      return { ...row, ...h.get(card.id)! };
    }),

  /** Title and due date (the card's fixed attributes). */
  update: protectedProcedure
    .input(z.object({
      cardId: z.string(),
      title: z.string().trim().min(1).max(512).optional(),
      dueDate: z.string().datetime({ offset: true }).nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const card = await cardInOrg(input.cardId, ctx.orgId);
      const patch: { title?: string; dueDate?: Date | null } = {};
      if (input.title !== undefined && input.title !== card.title) patch.title = input.title;
      if (input.dueDate !== undefined) patch.dueDate = input.dueDate ? new Date(input.dueDate) : null;
      if (Object.keys(patch).length) {
        await db.update(cards).set(patch).where(eq(cards.id, card.id));
        if (patch.title) await logEvent(card.id, "title_updated", ctx.userId, { from: card.title, to: patch.title });
        if (patch.dueDate !== undefined) await logEvent(card.id, "due_date_changed", ctx.userId, { to: input.dueDate });
      }
      return shaped(card.id);
    }),

  /** Replace the card's assignees (org members only). */
  setAssignees: protectedProcedure
    .input(z.object({ cardId: z.string(), userIds: z.array(z.string()).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const card = await cardInOrg(input.cardId, ctx.orgId);
      const ids = [...new Set(input.userIds)];
      const members = ids.length
        ? await db.select({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.orgId, ctx.orgId), inArray(memberships.userId, ids)))
        : [];
      if (members.length !== ids.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Responsável inválido" });
      await db.transaction(async (tx) => {
        await tx.delete(cardAssignees).where(eq(cardAssignees.cardId, card.id));
        if (ids.length) await tx.insert(cardAssignees).values(ids.map((userId) => ({ cardId: card.id, userId })));
      });
      await logEvent(card.id, "assignees_changed", ctx.userId, { userIds: ids });
      return shaped(card.id);
    }),

  /** Replace the card's labels (labels of the same pipe only). */
  setLabels: protectedProcedure
    .input(z.object({ cardId: z.string(), labelIds: z.array(z.string()).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const card = await cardInOrg(input.cardId, ctx.orgId);
      const ids = [...new Set(input.labelIds)];
      const valid = ids.length ? await db.select({ id: labels.id }).from(labels).where(and(eq(labels.pipeId, card.pipeId), inArray(labels.id, ids))) : [];
      if (valid.length !== ids.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Etiqueta inválida" });
      await db.transaction(async (tx) => {
        await tx.delete(cardLabels).where(eq(cardLabels.cardId, card.id));
        if (ids.length) await tx.insert(cardLabels).values(ids.map((labelId) => ({ cardId: card.id, labelId })));
      });
      await logEvent(card.id, "labels_changed", ctx.userId, { labelIds: ids });
      return shaped(card.id);
    }),

  /** Send to the trash (lixeira). Restorable. */
  remove: protectedProcedure.input(z.object({ cardId: z.string() })).mutation(async ({ ctx, input }) => {
    const card = await cardInOrg(input.cardId, ctx.orgId);
    await db.update(cards).set({ deletedAt: new Date(), deletedBy: ctx.userId }).where(eq(cards.id, card.id));
    await logEvent(card.id, "deleted", ctx.userId);
    return { ok: true };
  }),

  restore: protectedProcedure.input(z.object({ cardId: z.string() })).mutation(async ({ ctx, input }) => {
    const card = await cardInOrg(input.cardId, ctx.orgId, true);
    await db.update(cards).set({ deletedAt: null, deletedBy: null }).where(eq(cards.id, card.id));
    await logEvent(card.id, "restored", ctx.userId);
    return shaped(card.id);
  }),

  listTrash: protectedProcedure.input(z.object({ pipeId: z.string() })).query(async ({ ctx, input }) => {
    await assertPipeInOrg(input.pipeId, ctx.orgId);
    return db.select({ id: cards.id, number: cards.number, title: cards.title, deletedAt: cards.deletedAt, deletedBy: cards.deletedBy })
      .from(cards).where(and(eq(cards.pipeId, input.pipeId), isNotNull(cards.deletedAt))).orderBy(desc(cards.deletedAt));
  }),

  /** Copy a card in the same phase: fields (except "valor único"), labels, assignees, checklist (unticked). */
  duplicate: protectedProcedure.input(z.object({ cardId: z.string() })).mutation(async ({ ctx, input }) => {
    const card = await cardInOrg(input.cardId, ctx.orgId);
    const src = (await hydrate([card.id])).get(card.id)!;
    // Not copied: "valor único" values and attachment fields (files belong to the original).
    const uniques = new Set((await db.select({ id: fields.id, isUnique: fields.isUnique, type: fields.type }).from(fields)
      .where(eq(fields.pipeId, card.pipeId))).filter((f) => f.isUnique || f.type === "attachment").map((f) => f.id));
    const items = await db.select().from(checklistItems).where(eq(checklistItems.cardId, card.id));
    const newId = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(cards).values({
        id: newId, pipeId: card.pipeId, currentPhaseId: card.currentPhaseId, title: `${card.title} (cópia)`.slice(0, 512),
        createdBy: ctx.userId, dueDate: card.dueDate, done: card.done,
      });
      for (const v of src.values) {
        if (uniques.has(v.fieldId)) continue;
        await tx.insert(cardFields).values({ id: crypto.randomUUID(), cardId: newId, fieldId: v.fieldId, value: v.value, filledAt: new Date() });
      }
      if (src.labelIds.length) await tx.insert(cardLabels).values(src.labelIds.map((labelId) => ({ cardId: newId, labelId })));
      if (src.assigneeIds.length) await tx.insert(cardAssignees).values(src.assigneeIds.map((userId) => ({ cardId: newId, userId })));
      for (const it of items) {
        await tx.insert(checklistItems).values({ id: crypto.randomUUID(), cardId: newId, text: it.text, position: it.position });
      }
    });
    await logEvent(newId, "created", ctx.userId, { duplicatedFrom: card.number });
    return shaped(newId);
  }),

  /** "Atualizar do cadastro": copy the mapped values again from the connected item. */
  refillConnection: protectedProcedure.input(z.object({ cardId: z.string(), fieldId: z.string() })).mutation(async ({ ctx, input }) => {
    const card = await cardInOrg(input.cardId, ctx.orgId);
    const field = (await db.select().from(fields).where(eq(fields.id, input.fieldId)).limit(1))[0];
    if (!field || field.pipeId !== card.pipeId || field.type !== "connection") throw new TRPCError({ code: "BAD_REQUEST", message: "Campo inválido" });
    const row = (await db.select().from(cardFields).where(and(eq(cardFields.cardId, card.id), eq(cardFields.fieldId, field.id))).limit(1))[0];
    const values = await autofillFor(field, row?.value);
    await writeValues(card.id, values as Map<string, never>);
    await logEvent(card.id, "autofill_refreshed", ctx.userId, { fieldId: field.id, count: values.size });
    return shaped(card.id);
  }),

  /** "Conectado a": cards whose connection field holds this card (its parents). */
  parents: protectedProcedure.input(z.object({ cardId: z.string() })).query(async ({ ctx, input }) => {
    await cardInOrg(input.cardId, ctx.orgId);
    return linkedFrom(input.cardId, ctx.orgId);
  }),
});
