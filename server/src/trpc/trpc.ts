import { initTRPC, TRPCError } from "@trpc/server";
import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import superjson from "superjson";
import { eq, and } from "drizzle-orm";
import { db } from "../db/client.js";
import { memberships } from "../db/schema.js";
import { getUserIdFromRequest } from "../auth/session.js";
import { assertPipeRead, runAs } from "../access.js";

export interface Context {
  userId: string | null;
  orgId: string | null;
  role: "admin" | "member" | "guest" | null;
}

/** Build context from the session cookie: who is calling and which org. */
export async function createContext({ req }: CreateExpressContextOptions): Promise<Context> {
  const userId = await getUserIdFromRequest(req.headers.cookie);
  if (!userId) return { userId: null, orgId: null, role: null };
  // Single internal org: the user's first membership. Extend for multi-tenant.
  const m = (await db.select().from(memberships).where(eq(memberships.userId, userId)).limit(1))[0];
  return { userId, orgId: m?.orgId ?? null, role: m?.role ?? null };
}

const t = initTRPC.context<Context>().create({ transformer: superjson });

export const router = t.router;
export const publicProcedure = t.procedure;

/** Requires a logged-in user who belongs to an org. ctx.orgId/userId are non-null. */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.userId || !ctx.orgId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Faça login para continuar" });
  }
  // The caller rides along the request, so pipe access checks know who is asking.
  const userId = ctx.userId, orgId = ctx.orgId;
  return runAs(userId, ctx.role, () => next({ ctx: { ...ctx, userId, orgId } }));
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.role !== "admin") throw new TRPCError({ code: "FORBIDDEN", message: "Apenas administradores" });
  return next({ ctx });
});

/** Assert that a pipe belongs to the caller's org. The one authorization choke
 *  point for pipe-scoped data — call it before touching any pipe's children. */
export async function assertPipeInOrg(pipeId: string, orgId: string): Promise<void> {
  const { pipes } = await import("../db/schema.js");
  const row = (await db.select({ id: pipes.id }).from(pipes)
    .where(and(eq(pipes.id, pipeId), eq(pipes.orgId, orgId))).limit(1))[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Pipe não encontrado" });
  // Closed by default: the caller must be an org admin or a member of the pipe.
  await assertPipeRead(pipeId);
}
