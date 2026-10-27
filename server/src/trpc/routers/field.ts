import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import { db } from "../../db/client.js";
import { fields, phases } from "../../db/schema.js";
import { router, protectedProcedure, assertPipeInOrg } from "../trpc.js";

export const fieldRouter = router({
  listByPipe: protectedProcedure.input(z.object({ pipeId: z.string() })).query(async ({ ctx, input }) => {
    await assertPipeInOrg(input.pipeId, ctx.orgId);
    return db.select().from(fields).where(eq(fields.pipeId, input.pipeId)).orderBy(asc(fields.position));
  }),
  // Takes only phaseId; resolves the owning pipe to authorize.
  listByPhase: protectedProcedure.input(z.object({ phaseId: z.string() })).query(async ({ ctx, input }) => {
    const phase = (await db.select({ pipeId: phases.pipeId }).from(phases).where(eq(phases.id, input.phaseId)).limit(1))[0];
    if (!phase) return [];
    await assertPipeInOrg(phase.pipeId, ctx.orgId);
    return db.select().from(fields).where(eq(fields.phaseId, input.phaseId)).orderBy(asc(fields.position));
  }),
});
