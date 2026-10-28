import { z } from "zod";
import { eq, asc, inArray, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../../db/client.js";
import { comments, memberships } from "../../db/schema.js";
import { router, protectedProcedure } from "../trpc.js";
import { cardInOrg, logEvent } from "../cardAccess.js";
import { notifyMention } from "../../notify.js";

export const commentRouter = router({
  listByCard: protectedProcedure.input(z.object({ cardId: z.string() })).query(async ({ ctx, input }) => {
    await cardInOrg(input.cardId, ctx.orgId);
    return db.select().from(comments).where(eq(comments.cardId, input.cardId)).orderBy(asc(comments.createdAt));
  }),

  /** `mentions` = user ids picked with "@"; kept on the event for notifications (M6). */
  create: protectedProcedure
    .input(z.object({ cardId: z.string(), body: z.string().trim().min(1).max(10_000), mentions: z.array(z.string()).max(50).default([]) }))
    .mutation(async ({ ctx, input }) => {
      await cardInOrg(input.cardId, ctx.orgId);
      const mentions = input.mentions.length
        ? (await db.select({ userId: memberships.userId }).from(memberships)
            .where(and(eq(memberships.orgId, ctx.orgId), inArray(memberships.userId, input.mentions)))).map((m) => m.userId)
        : [];
      const id = crypto.randomUUID();
      await db.insert(comments).values({ id, cardId: input.cardId, authorId: ctx.userId, body: input.body });
      await logEvent(input.cardId, "commented", ctx.userId, { commentId: id, mentions });
      await notifyMention(mentions, input.cardId, ctx.userId, input.body);
      return (await db.select().from(comments).where(eq(comments.id, id)).limit(1))[0];
    }),

  /** Authors delete their own comments; admins any. */
  remove: protectedProcedure.input(z.object({ commentId: z.string() })).mutation(async ({ ctx, input }) => {
    const c = (await db.select().from(comments).where(eq(comments.id, input.commentId)).limit(1))[0];
    if (!c) throw new TRPCError({ code: "NOT_FOUND" });
    await cardInOrg(c.cardId, ctx.orgId);
    if (c.authorId !== ctx.userId && ctx.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Só o autor pode excluir o comentário" });
    await db.delete(comments).where(eq(comments.id, c.id));
    await logEvent(c.cardId, "comment_deleted", ctx.userId);
    return { ok: true };
  }),
});
