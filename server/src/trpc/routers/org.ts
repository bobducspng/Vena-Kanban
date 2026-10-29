import { z } from "zod";
import { eq, and, lt, desc, inArray, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { organizations, auditLog, users, pipes, dataTables, fields, pipeMembers } from "../../db/schema.js";
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

  /** Mapa de processos: pipes the caller sees, databases, and the connection fields between them. */
  map: protectedProcedure.query(async ({ ctx }) => {
    let pipeRows = await db.select({ id: pipes.id, name: pipes.name, icon: pipes.icon, color: pipes.color, folder: pipes.folder })
      .from(pipes).where(and(eq(pipes.orgId, ctx.orgId), isNull(pipes.deletedAt)));
    if (ctx.role !== "admin") {
      const mine = new Set((await db.select({ pipeId: pipeMembers.pipeId }).from(pipeMembers).where(eq(pipeMembers.userId, ctx.userId))).map((m) => m.pipeId));
      pipeRows = pipeRows.filter((p) => mine.has(p.id));
    }
    const tables = await db.select({ id: dataTables.id, name: dataTables.name, icon: dataTables.icon })
      .from(dataTables).where(and(eq(dataTables.orgId, ctx.orgId), isNull(dataTables.deletedAt)));
    const conn = pipeRows.length
      ? await db.select({ id: fields.id, pipeId: fields.pipeId, label: fields.label, settings: fields.settings })
        .from(fields).where(and(inArray(fields.pipeId, pipeRows.map((p) => p.id)), eq(fields.type, "connection"), isNull(fields.archivedAt)))
      : [];
    const known = new Set([...pipeRows.map((p) => p.id), ...tables.map((t) => t.id)]);
    const edges = conn.flatMap((f) => {
      const st = f.settings as { target?: "pipe" | "table"; targetId?: string } | null;
      return st?.targetId && known.has(st.targetId) ? [{ from: f.pipeId, to: st.targetId, kind: st.target ?? "pipe", label: f.label }] : [];
    });
    return { pipes: pipeRows, tables, edges };
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
