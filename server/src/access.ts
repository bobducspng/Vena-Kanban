import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "./db/client.js";
import { cardAssignees, pipeGroupMembers, pipeMembers, tableMembers, userGroupMembers } from "./db/schema.js";

/**
 * Who may see and change what (M10). Pipes are closed by default: org admins see
 * every pipe; everyone else sees the pipes they were added to, with a role:
 *   member   — every card;
 *   my_cards — only cards they created or are responsável for;
 *   read     — sees every card and comments, changes nothing.
 * The caller rides along each request (AsyncLocalStorage), so the existing pipe
 * choke point (assertPipeInOrg) enforces membership without changing its callers.
 * Requests without a caller (public forms, automations, scheduler) are system work.
 */

export type PipeRole = "admin" | "member" | "my_cards" | "read";
export const PIPE_ROLES = ["member", "my_cards", "read"] as const;
interface Who { userId: string; orgRole: string | null }
interface Caller extends Who { roles: Map<string, PipeRole | null> }

const als = new AsyncLocalStorage<Caller>();
export const runAs = <T>(userId: string, orgRole: string | null, fn: () => T) => als.run({ userId, orgRole, roles: new Map() }, fn);
export const caller = () => als.getStore() ?? null;
/** Run outside any caller: automations act for the pipe, not for whoever triggered them. */
export const asSystem = <T>(fn: () => T) => als.exit(fn);

const RANK: Record<string, number> = { read: 1, my_cards: 2, member: 3 };
/** Of several roles (own + groups), the one that gives the most access. */
const highest = (roles: PipeRole[]): PipeRole | null => roles.reduce<PipeRole | null>((best, r) => ((RANK[r] ?? 0) > (best ? RANK[best] ?? 0 : 0) ? r : best), null);

/** Pipes a (non-admin) person can open: their own memberships and their groups'. */
export async function pipesOfUser(userId: string): Promise<Set<string>> {
  const direct = await db.select({ pipeId: pipeMembers.pipeId }).from(pipeMembers).where(eq(pipeMembers.userId, userId));
  const viaGroups = await db.select({ pipeId: pipeGroupMembers.pipeId }).from(pipeGroupMembers)
    .innerJoin(userGroupMembers, eq(userGroupMembers.groupId, pipeGroupMembers.groupId)).where(eq(userGroupMembers.userId, userId));
  return new Set([...direct, ...viaGroups].map((r) => r.pipeId));
}

/** The caller's role in a pipe (cached per request); null = no access. */
export async function pipeRole(pipeId: string, who: Who | null = caller()): Promise<PipeRole | null> {
  if (!who) return "admin"; // system work
  if (who.orgRole === "admin") return "admin";
  const cache = (who as Partial<Caller>).roles;
  if (cache?.has(pipeId)) return cache.get(pipeId)!;
  const direct = await db.select({ role: pipeMembers.role }).from(pipeMembers)
    .where(and(eq(pipeMembers.pipeId, pipeId), eq(pipeMembers.userId, who.userId)));
  const viaGroups = await db.select({ role: pipeGroupMembers.role }).from(pipeGroupMembers)
    .innerJoin(userGroupMembers, eq(userGroupMembers.groupId, pipeGroupMembers.groupId))
    .where(and(eq(pipeGroupMembers.pipeId, pipeId), eq(userGroupMembers.userId, who.userId)));
  const role = highest([...direct, ...viaGroups].map((r) => r.role as PipeRole));
  cache?.set(pipeId, role);
  return role;
}

export type TableRole = "admin" | "member" | "read";
/**
 * The caller's access to a banco de dados: admins always; otherwise by the table's
 * "access" (all_edit = everyone edits · all_read = everyone reads, members edit ·
 * restricted = only members) and the person's own or group membership.
 */
export async function tableRole(table: { id: string; access: string }, who: Who | null = caller()): Promise<TableRole | null> {
  if (!who || who.orgRole === "admin") return "admin";
  if (table.access === "all_edit") return "member";
  const groups = (await db.select({ groupId: userGroupMembers.groupId }).from(userGroupMembers).where(eq(userGroupMembers.userId, who.userId))).map((g) => g.groupId);
  const rows = await db.select({ kind: tableMembers.kind, subjectId: tableMembers.subjectId, role: tableMembers.role }).from(tableMembers).where(eq(tableMembers.tableId, table.id));
  const mine = rows.filter((r) => (r.kind === "user" && r.subjectId === who.userId) || (r.kind === "group" && groups.includes(r.subjectId)));
  if (mine.some((r) => r.role === "member")) return "member";
  if (mine.length || table.access === "all_read") return "read";
  return null;
}

/** Throws NOT_FOUND when the caller cannot open the pipe (no hint that it exists). */
export async function assertPipeRead(pipeId: string) {
  if (!(await pipeRole(pipeId))) throw new TRPCError({ code: "NOT_FOUND", message: "Pipe não encontrado" });
}

/** "my_cards" sees/changes only cards they created or are responsável for. */
async function ownsCard(card: { id: string; createdBy: string | null }, userId: string) {
  if (card.createdBy === userId) return true;
  return !!(await db.select({ userId: cardAssignees.userId }).from(cardAssignees)
    .where(and(eq(cardAssignees.cardId, card.id), eq(cardAssignees.userId, userId))).limit(1))[0];
}

export async function canSeeCard(card: { id: string; pipeId: string; createdBy: string | null }, who: Who | null = caller()) {
  const role = await pipeRole(card.pipeId, who);
  if (!role) return false;
  return role !== "my_cards" || ownsCard(card, who!.userId);
}

/** Throws unless the caller may change this card. */
export async function assertCardWrite(card: { id: string; pipeId: string; createdBy: string | null }, who: Who | null = caller()) {
  const role = await pipeRole(card.pipeId, who);
  if (!role) throw new TRPCError({ code: "NOT_FOUND", message: "Card não encontrado" });
  if (role === "read") throw new TRPCError({ code: "FORBIDDEN", message: "Você tem acesso somente leitura neste pipe." });
  if (role === "my_cards" && !(await ownsCard(card, who!.userId))) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Neste pipe você só altera cards que criou ou em que é responsável." });
  }
}

/** Throws unless the caller may create cards in the pipe. */
export async function assertPipeWrite(pipeId: string, who: Who | null = caller()) {
  const role = await pipeRole(pipeId, who);
  if (!role) throw new TRPCError({ code: "NOT_FOUND", message: "Pipe não encontrado" });
  if (role === "read") throw new TRPCError({ code: "FORBIDDEN", message: "Você tem acesso somente leitura neste pipe." });
}
