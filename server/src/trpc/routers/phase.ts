import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import { db } from "../../db/client.js";
import { phases } from "../../db/schema.js";
import { router, protectedProcedure, assertPipeInOrg } from "../trpc.js";

export const phaseRouter = router({
  listByPipe: protectedProcedure.input(z.object({ pipeId: z.string() })).query(async ({ ctx, input }) => {
    await assertPipeInOrg(input.pipeId, ctx.orgId);
    return db.select().from(phases).where(eq(phases.pipeId, input.pipeId)).orderBy(asc(phases.position));
  }),
});
