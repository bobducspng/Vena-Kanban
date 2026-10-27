import { z } from "zod";
import { eq, inArray } from "drizzle-orm";
import { db } from "../../db/client.js";
import { users, memberships } from "../../db/schema.js";
import { router, protectedProcedure } from "../trpc.js";

export const userRouter = router({
  // Members of the caller's org.
  list: protectedProcedure.query(async ({ ctx }) => {
    const mems = await db.select({ userId: memberships.userId }).from(memberships).where(eq(memberships.orgId, ctx.orgId));
    const ids = mems.map((m) => m.userId);
    if (ids.length === 0) return [];
    return db.select().from(users).where(inArray(users.id, ids));
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    return (await db.select().from(users).where(eq(users.id, input.id)).limit(1))[0] ?? null;
  }),
  me: protectedProcedure.query(async ({ ctx }) => {
    return (await db.select().from(users).where(eq(users.id, ctx.userId)).limit(1))[0] ?? null;
  }),
});
