import { TRPCError } from "@trpc/server";
import { ScriptDrive, isScriptUrl, newSecret, scriptCode, seal, targetOf, unseal } from "../../driveBackup.js";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { eq, and, lt, desc, inArray, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { organizations, auditLog, users, pipes, dataTables, fields, driveTargets } from "../../db/schema.js";
import { pipesOfUser } from "../../access.js";
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
      const mine = await pipesOfUser(ctx.userId);
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

  /** Result of the last nightly backup (deploy/backup.sh writes it). */
  backupStatus: adminProcedure.query(async () => {
    const file = join(process.env.BACKUP_DIR ?? "/var/backups/fluxos", "status.json");
    try {
      const s = JSON.parse(await readFile(file, "utf8")) as { status: string; at: string; message: string; dbBytes: number; filesCount: number; filesBytes: number; diskFree: string };
      return { installed: true as const, ...s };
    } catch {
      return { installed: false as const };
    }
  }),

  /** Cópia no Google Drive (Apps Script): state of the setup and of the last nightly copy. */
  driveStatus: adminProcedure.query(async ({ ctx }) => {
    const row = (await db.select().from(driveTargets).where(eq(driveTargets.orgId, ctx.orgId)).limit(1))[0];
    let last: { status: string; at: string; message: string } | null = null;
    try { last = JSON.parse(await readFile(join(process.env.BACKUP_DIR ?? "/var/backups/fluxos", "drive-status.json"), "utf8")); } catch { /* not run yet */ }
    return row?.url ? { connected: true as const, email: row.email, folderUrl: row.folderUrl, last } : { connected: false as const };
  }),
  /** Step 1: the code to paste into script.google.com (creates this org's secret once). */
  driveScript: adminProcedure.mutation(async ({ ctx }) => {
    let row = (await db.select().from(driveTargets).where(eq(driveTargets.orgId, ctx.orgId)).limit(1))[0];
    if (!row) {
      await db.insert(driveTargets).values({ orgId: ctx.orgId, secret: seal(newSecret()), createdBy: ctx.userId });
      row = (await db.select().from(driveTargets).where(eq(driveTargets.orgId, ctx.orgId)).limit(1))[0];
    }
    return { code: scriptCode(unseal(row.secret)) };
  }),
  /** Step 2: the web app address; tested before it is kept. */
  driveConnect: adminProcedure.input(z.object({ url: z.string().trim().max(512) })).mutation(async ({ ctx, input }) => {
    const row = (await db.select().from(driveTargets).where(eq(driveTargets.orgId, ctx.orgId)).limit(1))[0];
    if (!row) throw new TRPCError({ code: "BAD_REQUEST", message: "Copie o código primeiro (passo 1)." });
    if (!isScriptUrl(input.url)) throw new TRPCError({ code: "BAD_REQUEST", message: "Cole o endereço do app da Web: começa com https://script.google.com/macros/s/ e termina com /exec." });
    try {
      const r = await new ScriptDrive(input.url, unseal(row.secret)).test();
      await db.update(driveTargets).set({ url: input.url, email: r.email, folderUrl: r.pasta }).where(eq(driveTargets.orgId, ctx.orgId));
      return { email: r.email, folderUrl: r.pasta };
    } catch (e) {
      throw new TRPCError({ code: "BAD_REQUEST", message: e instanceof Error ? e.message : String(e) });
    }
  }),
  driveTest: adminProcedure.mutation(async ({ ctx }) => {
    const t = await targetOf(ctx.orgId);
    if (!t) throw new TRPCError({ code: "BAD_REQUEST", message: "Drive não conectado" });
    try { await t.drive.test(); } catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: e instanceof Error ? e.message : String(e) }); }
    return { ok: true };
  }),
  driveDisconnect: adminProcedure.mutation(async ({ ctx }) => {
    await db.delete(driveTargets).where(eq(driveTargets.orgId, ctx.orgId));
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
