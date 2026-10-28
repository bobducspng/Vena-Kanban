import { z } from "zod";
import { eq, and } from "drizzle-orm";
import { db } from "../../db/client.js";
import { pipes, phases, fields, phaseTransitions } from "../../db/schema.js";
import { router, protectedProcedure, adminProcedure } from "../trpc.js";

export const pipeRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    db.select().from(pipes).where(eq(pipes.orgId, ctx.orgId))
  ),

  get: protectedProcedure.input(z.object({ pipeId: z.string() })).query(async ({ ctx, input }) => {
    return (await db.select().from(pipes)
      .where(and(eq(pipes.id, input.pipeId), eq(pipes.orgId, ctx.orgId))).limit(1))[0] ?? null;
  }),

  // Configuring pipes is admin-only.
  create: adminProcedure
    .input(z.object({ name: z.string().min(1).max(255), description: z.string().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const pipeId = crypto.randomUUID();
        await tx.insert(pipes).values({ id: pipeId, orgId: ctx.orgId, name: input.name, description: input.description, createdBy: ctx.userId });
        // Seed a usable default flow.
        const defs = [
          { name: "A fazer", color: "gray", isStart: true, isEnd: false },
          { name: "Em andamento", color: "blue", isStart: false, isEnd: false },
          { name: "Concluído", color: "green", isStart: false, isEnd: true },
        ];
        const phaseIds: string[] = [];
        for (let i = 0; i < defs.length; i++) {
          const id = crypto.randomUUID();
          phaseIds.push(id);
          await tx.insert(phases).values({ id, pipeId, name: defs[i].name, color: defs[i].color, position: i, isStart: defs[i].isStart, isEnd: defs[i].isEnd });
        }
        // Neighbours linked both ways: cards walk one phase at a time by default.
        for (let i = 1; i < phaseIds.length; i++) {
          await tx.insert(phaseTransitions).values([
            { fromPhaseId: phaseIds[i - 1], toPhaseId: phaseIds[i] },
            { fromPhaseId: phaseIds[i], toPhaseId: phaseIds[i - 1] },
          ]);
        }
        await tx.insert(fields).values({ id: crypto.randomUUID(), pipeId, phaseId: phaseIds[0], label: "Título", type: "short_text", required: true, position: 0 });
        return (await tx.select().from(pipes).where(eq(pipes.id, pipeId)).limit(1))[0];
      });
    }),
});
