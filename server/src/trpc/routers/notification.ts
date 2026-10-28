import { z } from "zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client.js";
import { notifications } from "../../db/schema.js";
import { router, protectedProcedure } from "../trpc.js";
import { markRead } from "../../notify.js";

/** The caller's notifications (sino). */
export const notificationRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    db.select().from(notifications).where(eq(notifications.userId, ctx.userId)).orderBy(desc(notifications.createdAt)).limit(50)
  ),
  unread: protectedProcedure.query(async ({ ctx }) => {
    const [{ n }] = await db.select({ n: sql<number>`COUNT(*)` }).from(notifications)
      .where(and(eq(notifications.userId, ctx.userId), isNull(notifications.readAt)));
    return Number(n);
  }),
  /** Mark some (or all, when `ids` is absent) as read. */
  markRead: protectedProcedure.input(z.object({ ids: z.array(z.string()).max(200).optional() })).mutation(async ({ ctx, input }) => {
    await markRead(ctx.userId, input.ids);
    return { ok: true };
  }),
});
