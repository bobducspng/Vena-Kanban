import { z } from "zod";
import { eq, and, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../../db/client.js";
import { cards, cardFields, cardAssignees, cardEvents, fields, phases } from "../../db/schema.js";
import { router, protectedProcedure, assertPipeInOrg } from "../trpc.js";

const valueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

// Shape a card row with its values[] and assigneeIds[] — matches the front-end type.
async function hydrate(cardIds: string[]) {
  if (cardIds.length === 0) return new Map();
  const vals = await db.select().from(cardFields).where(inArray(cardFields.cardId, cardIds));
  const asg = await db.select().from(cardAssignees).where(inArray(cardAssignees.cardId, cardIds));
  const map = new Map<string, { values: { fieldId: string; value: unknown }[]; assigneeIds: string[] }>();
  cardIds.forEach((id) => map.set(id, { values: [], assigneeIds: [] }));
  vals.forEach((v) => map.get(v.cardId)!.values.push({ fieldId: v.fieldId, value: v.value }));
  asg.forEach((a) => map.get(a.cardId)!.assigneeIds.push(a.userId));
  return map;
}

/** Required fields of a phase that are empty for this card's value set. */
function missingRequired(
  required: { id: string; label: string }[],
  values: { fieldId: string; value: unknown }[]
): string[] {
  return required
    .filter((f) => {
      const v = values.find((x) => x.fieldId === f.id)?.value;
      return v === undefined || v === null || v === "";
    })
    .map((f) => f.label);
}

export const cardRouter = router({
  listByPipe: protectedProcedure.input(z.object({ pipeId: z.string() })).query(async ({ ctx, input }) => {
    await assertPipeInOrg(input.pipeId, ctx.orgId);
    const rows = await db.select().from(cards).where(eq(cards.pipeId, input.pipeId));
    const h = await hydrate(rows.map((r) => r.id));
    return rows.map((r) => ({ ...r, ...h.get(r.id)! }));
  }),

  get: protectedProcedure.input(z.object({ cardId: z.string() })).query(async ({ ctx, input }) => {
    const row = (await db.select().from(cards).where(eq(cards.id, input.cardId)).limit(1))[0];
    if (!row) return null;
    await assertPipeInOrg(row.pipeId, ctx.orgId);
    const h = await hydrate([row.id]);
    return { ...row, ...h.get(row.id)! };
  }),

  create: protectedProcedure
    .input(z.object({
      pipeId: z.string(),
      title: z.string().max(512),
      values: z.array(z.object({ fieldId: z.string(), value: valueSchema })),
    }))
    .mutation(async ({ ctx, input }) => {
      await assertPipeInOrg(input.pipeId, ctx.orgId);
      const start = (await db.select().from(phases)
        .where(and(eq(phases.pipeId, input.pipeId), eq(phases.isStart, true))).limit(1))[0];
      if (!start) throw new TRPCError({ code: "BAD_REQUEST", message: "Pipe sem fase inicial" });

      const required = await db.select({ id: fields.id, label: fields.label }).from(fields)
        .where(and(eq(fields.phaseId, start.id), eq(fields.required, true)));
      const missing = missingRequired(required, input.values);
      if (missing.length) throw new TRPCError({ code: "BAD_REQUEST", message: `Preencha os campos obrigatórios: ${missing.join(", ")}` });

      return db.transaction(async (tx) => {
        const cardId = crypto.randomUUID();
        await tx.insert(cards).values({
          id: cardId, pipeId: input.pipeId, currentPhaseId: start.id,
          title: input.title || "(sem título)", createdBy: ctx.userId,
        });
        for (const v of input.values) {
          await tx.insert(cardFields).values({
            id: crypto.randomUUID(), cardId, fieldId: v.fieldId, value: v.value,
            filledAt: v.value === null || v.value === "" ? null : new Date(),
          });
        }
        await tx.insert(cardEvents).values({ id: crypto.randomUUID(), cardId, type: "created", actorId: ctx.userId });
        const h = await hydrate([cardId]);
        const row = (await tx.select().from(cards).where(eq(cards.id, cardId)).limit(1))[0];
        return { ...row, ...h.get(cardId)! };
      });
    }),

  updateField: protectedProcedure
    .input(z.object({ cardId: z.string(), fieldId: z.string(), value: valueSchema }))
    .mutation(async ({ ctx, input }) => {
      const card = (await db.select().from(cards).where(eq(cards.id, input.cardId)).limit(1))[0];
      if (!card) throw new TRPCError({ code: "NOT_FOUND" });
      await assertPipeInOrg(card.pipeId, ctx.orgId);

      const existing = (await db.select().from(cardFields)
        .where(and(eq(cardFields.cardId, input.cardId), eq(cardFields.fieldId, input.fieldId))).limit(1))[0];
      const filledAt = input.value === null || input.value === "" ? null : new Date();
      if (existing) {
        await db.update(cardFields).set({ value: input.value, filledAt })
          .where(eq(cardFields.id, existing.id));
      } else {
        await db.insert(cardFields).values({ id: crypto.randomUUID(), cardId: input.cardId, fieldId: input.fieldId, value: input.value, filledAt });
      }
      await db.insert(cardEvents).values({ id: crypto.randomUUID(), cardId: input.cardId, type: "field_updated", actorId: ctx.userId });
      const h = await hydrate([input.cardId]);
      return { ...card, ...h.get(input.cardId)! };
    }),

  move: protectedProcedure
    .input(z.object({ cardId: z.string(), toPhaseId: z.string(), version: z.number().int().optional() }))
    .mutation(async ({ ctx, input }) => {
      const card = (await db.select().from(cards).where(eq(cards.id, input.cardId)).limit(1))[0];
      if (!card) throw new TRPCError({ code: "NOT_FOUND" });
      await assertPipeInOrg(card.pipeId, ctx.orgId);

      const to = (await db.select().from(phases).where(eq(phases.id, input.toPhaseId)).limit(1))[0];
      if (!to || to.pipeId !== card.pipeId) throw new TRPCError({ code: "BAD_REQUEST", message: "Fase destino inválida" });

      // Required-field gate on the phase being left.
      const required = await db.select({ id: fields.id, label: fields.label }).from(fields)
        .where(and(eq(fields.phaseId, card.currentPhaseId), eq(fields.required, true)));
      const vals = await db.select().from(cardFields).where(eq(cardFields.cardId, card.id));
      const missing = missingRequired(required, vals.map((v) => ({ fieldId: v.fieldId, value: v.value })));
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
      const h = await hydrate([card.id]);
      const row = (await db.select().from(cards).where(eq(cards.id, card.id)).limit(1))[0];
      return { ...row, ...h.get(card.id)! };
    }),
});
