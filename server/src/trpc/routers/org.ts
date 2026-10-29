import { z } from "zod";
import { eq, and, lt, desc } from "drizzle-orm";
import { db } from "../../db/client.js";
import { organizations, auditLog, users } from "../../db/schema.js";
import { router, protectedProcedure, adminProcedure } from "../trpc.js";

export const orgRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const o = (await db.select({ id: organizations.id, name: organizations.name }).from(organizations).where(eq(organizations.id, ctx.orgId)).limit(1))[0];
    return o ?? null;
  }),
  /** The name shows on top of the portal. */
  update: adminProcedure.input(z.object({ name: z.string().trim().min(1).max(255) })).mutation(async ({ ctx, input }) => {
    await db.update(organizations).set({ name: input.name }).where(eq(organizations.id, ctx.orgId));
    return { ok: true };
  }),

  /** Auditoria, newest first; `before` pages back. */
  audit: adminProcedure
    .input(z.object({ before: z.date().optional(), limit: z.number().int().min(1).max(5000).default(100) }))
    .query(async ({ ctx, input }) => {
      return db.select({ id: auditLog.id, action: auditLog.action, input: auditLog.input, createdAt: auditLog.createdAt, userName: users.name, userEmail: users.email })
        .from(auditLog).leftJoin(users, eq(users.id, auditLog.userId))
        .where(and(eq(auditLog.orgId, ctx.orgId), input.before ? lt(auditLog.createdAt, input.before) : undefined))
        .orderBy(desc(auditLog.createdAt)).limit(input.limit);
    }),
});
