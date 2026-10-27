import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import { db } from "../../db/client.js";
import { cardEvents, cards } from "../../db/schema.js";
import { router, protectedProcedure, assertPipeInOrg } from "../trpc.js";

export const eventRouter = router({
  listByCard: protectedProcedure.input(z.object({ cardId: z.string() })).query(async ({ ctx, input }) => {
    const card = (await db.select({ pipeId: cards.pipeId }).from(cards).where(eq(cards.id, input.cardId)).limit(1))[0];
    if (!card) return [];
    await assertPipeInOrg(card.pipeId, ctx.orgId);
    return db.select().from(cardEvents).where(eq(cardEvents.cardId, input.cardId)).orderBy(asc(cardEvents.createdAt));
  }),
});
