import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../../db/client.js";
import { reports, users } from "../../db/schema.js";
import { router, protectedProcedure, assertPipeInOrg } from "../trpc.js";

/**
 * Relatórios salvos (M12). The definition is stored here; the browser computes the
 * result from the cards each person can already see (pipe access applies as usual).
 */
const config = z.object({
  pipeIds: z.array(z.string()).min(1).max(20),
  columns: z.array(z.string().max(64)).max(60),
  filters: z.object({
    status: z.enum(["all", "open", "done", "late"]).default("all"),
    phaseNames: z.array(z.string().max(255)).max(100).default([]),
    assigneeId: z.string().nullable().default(null),
    period: z.object({
      by: z.string().max(64).default("created"), // created | due | f:<fieldId>
      range: z.enum(["all", "7d", "30d", "90d", "this_month", "last_month", "this_year", "custom"]).default("all"),
      from: z.string().max(10).nullable().default(null),
      to: z.string().max(10).nullable().default(null),
    }).default({ by: "created", range: "all", from: null, to: null }),
  }),
  groupBy: z.string().max(64).default("none"), // none | pipe | phase | assignee | label | month | f:<fieldId>
  measure: z.object({ op: z.enum(["count", "sum", "avg", "min", "max"]).default("count"), fieldId: z.string().nullable().default(null) }),
});
export type ReportConfig = z.infer<typeof config>;

async function mine(reportId: string, orgId: string, userId: string, role: string | null) {
  const r = (await db.select().from(reports).where(and(eq(reports.id, reportId), eq(reports.orgId, orgId))).limit(1))[0];
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Relatório não encontrado" });
  if (r.createdBy !== userId && role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Só quem criou (ou um administrador) altera este relatório." });
  return r;
}

export const reportRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    return db.select({ id: reports.id, name: reports.name, config: reports.config, createdBy: reports.createdBy, createdAt: reports.createdAt, author: users.name })
      .from(reports).leftJoin(users, eq(users.id, reports.createdBy)).where(eq(reports.orgId, ctx.orgId)).orderBy(desc(reports.createdAt));
  }),

  save: protectedProcedure.input(z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(255), config })).mutation(async ({ ctx, input }) => {
    for (const p of input.config.pipeIds) await assertPipeInOrg(p, ctx.orgId); // only pipes the person can open
    const row = { name: input.name, config: input.config, scope: (input.config.pipeIds.length > 1 ? "company" : "pipe") as "company" | "pipe", pipeId: input.config.pipeIds.length === 1 ? input.config.pipeIds[0] : null };
    if (input.id) {
      await mine(input.id, ctx.orgId, ctx.userId, ctx.role);
      await db.update(reports).set(row).where(eq(reports.id, input.id));
      return { id: input.id };
    }
    const id = crypto.randomUUID();
    await db.insert(reports).values({ id, orgId: ctx.orgId, createdBy: ctx.userId, ...row });
    return { id };
  }),

  remove: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await mine(input.id, ctx.orgId, ctx.userId, ctx.role);
    await db.delete(reports).where(eq(reports.id, input.id));
    return { ok: true };
  }),
});
