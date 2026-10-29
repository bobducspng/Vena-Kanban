import { z } from "zod";
import { eq, and, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../../db/client.js";
import { users, memberships, pipeMembers, sessions, cardAssignees, phaseAssignees } from "../../db/schema.js";
import { router, adminProcedure, assertPipeInOrg } from "../trpc.js";
import { PIPE_ROLES } from "../../access.js";

async function membershipOf(userId: string, orgId: string) {
  const m = (await db.select().from(memberships).where(and(eq(memberships.userId, userId), eq(memberships.orgId, orgId))).limit(1))[0];
  if (!m) throw new TRPCError({ code: "NOT_FOUND", message: "Pessoa não encontrada" });
  return m;
}

/** At least one admin must remain, or nobody can configure anything. */
async function assertAnotherAdmin(orgId: string, userId: string) {
  const others = await db.select({ id: memberships.id }).from(memberships)
    .where(and(eq(memberships.orgId, orgId), eq(memberships.role, "admin"), ne(memberships.userId, userId))).limit(1);
  if (!others.length) throw new TRPCError({ code: "BAD_REQUEST", message: "A organização precisa de pelo menos um administrador." });
}

/** Admins (M10): who is in the organisation and in each pipe. */
export const peopleRouter = router({
  /** Everyone in the org, with the pipes they were added to. */
  list: adminProcedure.query(async ({ ctx }) => {
    const rows = await db.select({ id: users.id, name: users.name, email: users.email, avatarUrl: users.avatarUrl, role: memberships.role, since: memberships.createdAt })
      .from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.orgId, ctx.orgId));
    const pm = await db.select().from(pipeMembers);
    return rows.map((r) => ({ ...r, pipes: pm.filter((m) => m.userId === r.id).map((m) => ({ pipeId: m.pipeId, role: m.role })) }));
  }),

  setOrgRole: adminProcedure.input(z.object({ userId: z.string(), role: z.enum(["admin", "member"]) })).mutation(async ({ ctx, input }) => {
    const m = await membershipOf(input.userId, ctx.orgId);
    if (m.role === "admin" && input.role !== "admin") await assertAnotherAdmin(ctx.orgId, input.userId);
    await db.update(memberships).set({ role: input.role }).where(eq(memberships.id, m.id));
    return { ok: true };
  }),

  /** Takes the person out: no org, no pipes, logged out. Cards and history keep their name. */
  remove: adminProcedure.input(z.object({ userId: z.string() })).mutation(async ({ ctx, input }) => {
    if (input.userId === ctx.userId) throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode remover a si mesmo." });
    const m = await membershipOf(input.userId, ctx.orgId);
    if (m.role === "admin") await assertAnotherAdmin(ctx.orgId, input.userId);
    await db.delete(pipeMembers).where(eq(pipeMembers.userId, input.userId));
    await db.delete(cardAssignees).where(eq(cardAssignees.userId, input.userId));
    await db.delete(phaseAssignees).where(eq(phaseAssignees.userId, input.userId));
    await db.delete(memberships).where(eq(memberships.id, m.id));
    await db.delete(sessions).where(eq(sessions.userId, input.userId));
    return { ok: true };
  }),

  /** Members of a pipe (admins of the org see every pipe and are not listed). */
  pipeMembers: adminProcedure.input(z.object({ pipeId: z.string() })).query(async ({ ctx, input }) => {
    await assertPipeInOrg(input.pipeId, ctx.orgId);
    return db.select({ userId: pipeMembers.userId, role: pipeMembers.role }).from(pipeMembers).where(eq(pipeMembers.pipeId, input.pipeId));
  }),

  /** Add, change or (role null) remove someone in a pipe. */
  setPipeRole: adminProcedure
    .input(z.object({ pipeId: z.string(), userId: z.string(), role: z.enum(PIPE_ROLES).nullable() }))
    .mutation(async ({ ctx, input }) => {
      await assertPipeInOrg(input.pipeId, ctx.orgId);
      await membershipOf(input.userId, ctx.orgId);
      const key = and(eq(pipeMembers.pipeId, input.pipeId), eq(pipeMembers.userId, input.userId));
      if (input.role === null) await db.delete(pipeMembers).where(key);
      else await db.insert(pipeMembers).values({ pipeId: input.pipeId, userId: input.userId, role: input.role }).onDuplicateKeyUpdate({ set: { role: input.role } });
      return { ok: true };
    }),
});
