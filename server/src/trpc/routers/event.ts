import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import { db } from "../../db/client.js";
import { cardEvents } from "../../db/schema.js";
import { router, protectedProcedure } from "../trpc.js";
import { cardInOrg } from "../cardAccess.js";

export const eventRouter = router({
  listByCard: protectedProcedure.input(z.object({ cardId: z.string() })).query(async ({ ctx, input }) => {
    await cardInOrg(input.cardId, ctx.orgId, true);
    return db.select().from(cardEvents).where(eq(cardEvents.cardId, input.cardId)).orderBy(asc(cardEvents.createdAt));
  }),
});
