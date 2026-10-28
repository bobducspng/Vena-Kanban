import { z } from "zod";
import { eq, asc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../../db/client.js";
import { checklistItems } from "../../db/schema.js";
import { router, protectedProcedure } from "../trpc.js";
import { cardInOrg } from "../cardAccess.js";

async function itemInOrg(itemId: string, orgId: string) {
  const item = (await db.select().from(checklistItems).where(eq(checklistItems.id, itemId)).limit(1))[0];
  if (!item) throw new TRPCError({ code: "NOT_FOUND", message: "Item não encontrado" });
  await cardInOrg(item.cardId, orgId);
  return item;
}

export const checklistRouter = router({
  listByCard: protectedProcedure.input(z.object({ cardId: z.string() })).query(async ({ ctx, input }) => {
    await cardInOrg(input.cardId, ctx.orgId);
    return db.select().from(checklistItems).where(eq(checklistItems.cardId, input.cardId)).orderBy(asc(checklistItems.position));
  }),

  add: protectedProcedure
    .input(z.object({ cardId: z.string(), text: z.string().trim().min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      await cardInOrg(input.cardId, ctx.orgId);
      const [{ max }] = await db.select({ max: sql<number | null>`MAX(${checklistItems.position})` })
        .from(checklistItems).where(eq(checklistItems.cardId, input.cardId));
      const id = crypto.randomUUID();
      await db.insert(checklistItems).values({ id, cardId: input.cardId, text: input.text, position: (max ?? -1) + 1 });
      return { id };
    }),

  update: protectedProcedure
    .input(z.object({ itemId: z.string(), text: z.string().trim().min(1).max(500).optional(), done: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      await itemInOrg(input.itemId, ctx.orgId);
      const { itemId, ...patch } = input;
      if (Object.keys(patch).length) await db.update(checklistItems).set(patch).where(eq(checklistItems.id, itemId));
      return { ok: true };
    }),

  remove: protectedProcedure.input(z.object({ itemId: z.string() })).mutation(async ({ ctx, input }) => {
    await itemInOrg(input.itemId, ctx.orgId);
    await db.delete(checklistItems).where(eq(checklistItems.id, input.itemId));
    return { ok: true };
  }),
});
