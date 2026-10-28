import { z } from "zod";
import { eq, asc, inArray, or, and, sql, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../../db/client.js";
import { phases, cards, fields, cardFields, phaseTransitions, phaseAssignees, memberships, fieldConditions } from "../../db/schema.js";
import { router, protectedProcedure, adminProcedure, assertPipeInOrg } from "../trpc.js";

const color = z.enum(["gray", "red", "orange", "amber", "green", "teal", "blue", "purple", "pink"]);

/** Load a phase and authorize its pipe. The phase-scoped choke point. */
async function phaseInOrg(phaseId: string, orgId: string) {
  const phase = (await db.select().from(phases).where(eq(phases.id, phaseId)).limit(1))[0];
  if (!phase) throw new TRPCError({ code: "NOT_FOUND", message: "Fase não encontrada" });
  await assertPipeInOrg(phase.pipeId, orgId);
  return phase;
}

export const phaseRouter = router({
  // Each phase comes with `allowedTo`: the phases a card in it may be moved to.
  listByPipe: protectedProcedure.input(z.object({ pipeId: z.string() })).query(async ({ ctx, input }) => {
    await assertPipeInOrg(input.pipeId, ctx.orgId);
    const rows = await db.select().from(phases).where(eq(phases.pipeId, input.pipeId)).orderBy(asc(phases.position));
    const ids = rows.map((r) => r.id);
    const links = ids.length ? await db.select().from(phaseTransitions).where(inArray(phaseTransitions.fromPhaseId, ids)) : [];
    const people = ids.length ? await db.select().from(phaseAssignees).where(inArray(phaseAssignees.phaseId, ids)) : [];
    return rows.map((r) => ({
      ...r,
      allowedTo: links.filter((l) => l.fromPhaseId === r.id).map((l) => l.toPhaseId),
      assigneeIds: people.filter((a) => a.phaseId === r.id).map((a) => a.userId),
    }));
  }),

  create: adminProcedure
    .input(z.object({ pipeId: z.string(), name: z.string().trim().min(1).max(255), color: color.default("gray") }))
    .mutation(async ({ ctx, input }) => {
      await assertPipeInOrg(input.pipeId, ctx.orgId);
      const [{ max }] = await db.select({ max: sql<number | null>`MAX(${phases.position})` })
        .from(phases).where(eq(phases.pipeId, input.pipeId));
      const last = (await db.select({ id: phases.id }).from(phases)
        .where(eq(phases.pipeId, input.pipeId)).orderBy(desc(phases.position)).limit(1))[0];
      const id = crypto.randomUUID();
      await db.transaction(async (tx) => {
        await tx.insert(phases).values({ id, pipeId: input.pipeId, name: input.name, color: input.color, position: (max ?? -1) + 1 });
        // Linked to its neighbour both ways, like the original.
        if (last) await tx.insert(phaseTransitions).values([{ fromPhaseId: last.id, toPhaseId: id }, { fromPhaseId: id, toPhaseId: last.id }]);
      });
      return (await db.select().from(phases).where(eq(phases.id, id)).limit(1))[0];
    }),

  update: adminProcedure
    .input(z.object({
      phaseId: z.string(),
      name: z.string().trim().min(1).max(255).optional(),
      color: color.optional(),
      description: z.string().max(2000).nullable().optional(),
      isEnd: z.boolean().optional(),
      canCreateCard: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const phase = await phaseInOrg(input.phaseId, ctx.orgId);
      const { phaseId, ...patch } = input;
      if (Object.keys(patch).length) await db.update(phases).set(patch).where(eq(phases.id, phaseId));
      // Cards already sitting in this phase follow its "end" flag.
      if (patch.isEnd !== undefined && patch.isEnd !== phase.isEnd) {
        await db.update(cards).set({ done: patch.isEnd }).where(eq(cards.currentPhaseId, phaseId));
      }
      return (await db.select().from(phases).where(eq(phases.id, phaseId)).limit(1))[0];
    }),

  /** Replace "Mover para": the phases a card in this phase may be moved to manually. */
  setTransitions: adminProcedure
    .input(z.object({ phaseId: z.string(), toPhaseIds: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      const phase = await phaseInOrg(input.phaseId, ctx.orgId);
      const siblings = await db.select({ id: phases.id }).from(phases).where(eq(phases.pipeId, phase.pipeId));
      const valid = new Set(siblings.map((s) => s.id));
      if (input.toPhaseIds.some((id) => !valid.has(id) || id === phase.id)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Fase de destino inválida" });
      }
      const targets = [...new Set(input.toPhaseIds)];
      await db.transaction(async (tx) => {
        await tx.delete(phaseTransitions).where(eq(phaseTransitions.fromPhaseId, phase.id));
        if (targets.length) {
          await tx.insert(phaseTransitions).values(targets.map((to) => ({ fromPhaseId: phase.id, toPhaseId: to })));
        }
      });
      return { ok: true };
    }),

  /** Responsáveis da fase: assigned to every card while it is in this phase. */
  setAssignees: adminProcedure
    .input(z.object({ phaseId: z.string(), userIds: z.array(z.string()).max(50) }))
    .mutation(async ({ ctx, input }) => {
      const phase = await phaseInOrg(input.phaseId, ctx.orgId);
      const ids = [...new Set(input.userIds)];
      const ok = ids.length ? await db.select({ userId: memberships.userId }).from(memberships)
        .where(and(eq(memberships.orgId, ctx.orgId), inArray(memberships.userId, ids))) : [];
      if (ok.length !== ids.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Responsável inválido" });
      await db.transaction(async (tx) => {
        await tx.delete(phaseAssignees).where(eq(phaseAssignees.phaseId, phase.id));
        if (ids.length) await tx.insert(phaseAssignees).values(ids.map((userId) => ({ phaseId: phase.id, userId })));
      });
      return { ok: true };
    }),

  /** Make this the start phase (where new cards land and the start form lives). */
  setStart: adminProcedure.input(z.object({ phaseId: z.string() })).mutation(async ({ ctx, input }) => {
    const phase = await phaseInOrg(input.phaseId, ctx.orgId);
    await db.transaction(async (tx) => {
      await tx.update(phases).set({ isStart: false }).where(eq(phases.pipeId, phase.pipeId));
      await tx.update(phases).set({ isStart: true }).where(eq(phases.id, phase.id));
    });
    return { ok: true };
  }),

  /** Persist a new order. `phaseIds` must be exactly the pipe's phases. */
  reorder: adminProcedure
    .input(z.object({ pipeId: z.string(), phaseIds: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      await assertPipeInOrg(input.pipeId, ctx.orgId);
      const rows = await db.select({ id: phases.id }).from(phases).where(eq(phases.pipeId, input.pipeId));
      const known = new Set(rows.map((r) => r.id));
      if (rows.length !== input.phaseIds.length || !input.phaseIds.every((id) => known.has(id))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Lista de fases desatualizada. Recarregue." });
      }
      await db.transaction(async (tx) => {
        for (let i = 0; i < input.phaseIds.length; i++) {
          await tx.update(phases).set({ position: i }).where(eq(phases.id, input.phaseIds[i]));
        }
      });
      return { ok: true };
    }),

  /** Delete an empty phase (no cards) that is not the start phase. Its fields go with it. */
  remove: adminProcedure.input(z.object({ phaseId: z.string() })).mutation(async ({ ctx, input }) => {
    const phase = await phaseInOrg(input.phaseId, ctx.orgId);
    if (phase.isStart) throw new TRPCError({ code: "BAD_REQUEST", message: "A fase inicial não pode ser excluída. Defina outra como inicial antes." });
    const [{ n }] = await db.select({ n: sql<number>`COUNT(*)` }).from(cards).where(eq(cards.currentPhaseId, phase.id));
    if (Number(n) > 0) throw new TRPCError({ code: "BAD_REQUEST", message: `A fase tem ${n} card(s). Mova-os antes de excluir.` });
    await db.transaction(async (tx) => {
      const fieldIds = (await tx.select({ id: fields.id }).from(fields).where(eq(fields.phaseId, phase.id))).map((f) => f.id);
      if (fieldIds.length) {
        await tx.delete(cardFields).where(inArray(cardFields.fieldId, fieldIds));
        await tx.delete(fields).where(inArray(fields.id, fieldIds));
      }
      await tx.delete(phaseTransitions).where(or(eq(phaseTransitions.fromPhaseId, phase.id), eq(phaseTransitions.toPhaseId, phase.id)));
      await tx.delete(phaseAssignees).where(eq(phaseAssignees.phaseId, phase.id));
      await tx.delete(fieldConditions).where(eq(fieldConditions.phaseId, phase.id));
      await tx.delete(phases).where(eq(phases.id, phase.id));
    });
    return { ok: true };
  }),
});
