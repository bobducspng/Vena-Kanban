import { z } from "zod";
import { eq, and, inArray, isNull, isNotNull, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../../db/client.js";
import { cards, cardFields, cardAssignees, cardLabels, fields, labels, memberships, checklistItems, cardPhaseHistory, phases, pipes } from "../../db/schema.js";
import { calendarOf, deadlinesOf } from "../../slaService.js";
import { notifyAssigned } from "../../notify.js";
import { businessMinutesBetween } from "../../businessTime.js";
import { cardInOrg, logEvent } from "../cardAccess.js";
import { linkedFrom } from "../../connections.js";
import { hydrate, shaped, writeValues, autofillFor, createCard, setFieldValue, moveCard } from "../../cardService.js";
import { router, protectedProcedure, assertPipeInOrg } from "../trpc.js";

// Lists hold checklist options, user ids (responsáveis) or label ids (etiquetas).
const valueSchema = z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string().max(255)).max(200)]);

// Create / set value / move live in cardService.ts (shared with the automation engine).
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
      const cardId = await createCard({ ...input, orgId: ctx.orgId, actor: { userId: ctx.userId, depth: 0 } });
      return shaped(cardId);
    }),

  updateField: protectedProcedure
    .input(z.object({ cardId: z.string(), fieldId: z.string(), value: valueSchema }))
    .mutation(async ({ ctx, input }) => {
      const card = await cardInOrg(input.cardId, ctx.orgId);
      await setFieldValue({ card, fieldId: input.fieldId, value: input.value, orgId: ctx.orgId, actor: { userId: ctx.userId, depth: 0 }, checkEditable: true });
      return shaped(card.id);
    }),

  move: protectedProcedure
    .input(z.object({ cardId: z.string(), toPhaseId: z.string(), version: z.number().int().optional() }))
    .mutation(async ({ ctx, input }) => {
      const card = await cardInOrg(input.cardId, ctx.orgId);
      await moveCard({ card, toPhaseId: input.toPhaseId, actor: { userId: ctx.userId, depth: 0 }, checkTransition: true, version: input.version });
      return shaped(card.id);
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
      const before = new Set((await db.select({ userId: cardAssignees.userId }).from(cardAssignees).where(eq(cardAssignees.cardId, card.id))).map((a) => a.userId));
      await db.transaction(async (tx) => {
        await tx.delete(cardAssignees).where(eq(cardAssignees.cardId, card.id));
        if (ids.length) await tx.insert(cardAssignees).values(ids.map((userId) => ({ cardId: card.id, userId })));
      });
      await logEvent(card.id, "assignees_changed", ctx.userId, { userIds: ids });
      await notifyAssigned(ids.filter((u) => !before.has(u)), card.id, { userId: ctx.userId });
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

  /** Alerts of a card: deadlines (atraso/expiração) and time spent in each phase. */
  timeline: protectedProcedure.input(z.object({ cardId: z.string() })).query(async ({ ctx, input }) => {
    const card = await cardInOrg(input.cardId, ctx.orgId);
    const pipe = (await db.select({ business: pipes.businessHoursOnly }).from(pipes).where(eq(pipes.id, card.pipeId)).limit(1))[0];
    const cal = pipe?.business ? await calendarOf(ctx.orgId) : null;
    const stays = await db.select({ phaseId: cardPhaseHistory.phaseId, name: phases.name, enteredAt: cardPhaseHistory.enteredAt, leftAt: cardPhaseHistory.leftAt, becameLate: cardPhaseHistory.becameLate })
      .from(cardPhaseHistory).innerJoin(phases, eq(phases.id, cardPhaseHistory.phaseId))
      .where(eq(cardPhaseHistory.cardId, card.id)).orderBy(cardPhaseHistory.enteredAt);
    const now = new Date();
    return {
      deadlines: await deadlinesOf(card.id),
      stays: stays.map((st) => ({ ...st, minutes: businessMinutesBetween(st.enteredAt, st.leftAt ?? now, cal) })),
      businessHours: !!pipe?.business,
    };
  }),

  /** "Meu trabalho": cards where I am a responsável (not in the trash), across pipes. */
  myWork: protectedProcedure.query(async ({ ctx }) => {
    return db.select({
      id: cards.id, number: cards.number, title: cards.title, pipeId: cards.pipeId, pipeName: pipes.name, pipeIcon: pipes.icon,
      phaseName: phases.name, dueDate: cards.dueDate, done: cards.done, lateAt: cards.lateAt, expiredAt: cards.expiredAt,
      overdueAt: cards.overdueAt, updatedAt: cards.updatedAt, createdAt: cards.createdAt,
    })
      .from(cardAssignees)
      .innerJoin(cards, eq(cards.id, cardAssignees.cardId))
      .innerJoin(pipes, eq(pipes.id, cards.pipeId))
      .innerJoin(phases, eq(phases.id, cards.currentPhaseId))
      .where(and(eq(cardAssignees.userId, ctx.userId), eq(pipes.orgId, ctx.orgId), isNull(cards.deletedAt), isNull(pipes.deletedAt)))
      .orderBy(desc(cards.updatedAt))
      .limit(500);
  }),
});
