import { AsyncLocalStorage } from "node:async_hooks";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "./db/client.js";
import { cardAssignees, pipeMembers } from "./db/schema.js";

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

/** The caller's role in a pipe (cached per request); null = no access. */
export async function pipeRole(pipeId: string, who: Who | null = caller()): Promise<PipeRole | null> {
  if (!who) return "admin"; // system work
  if (who.orgRole === "admin") return "admin";
  const cache = (who as Partial<Caller>).roles;
  if (cache?.has(pipeId)) return cache.get(pipeId)!;
  const row = (await db.select({ role: pipeMembers.role }).from(pipeMembers)
    .where(and(eq(pipeMembers.pipeId, pipeId), eq(pipeMembers.userId, who.userId))).limit(1))[0];
  const role = (row?.role as PipeRole | undefined) ?? null;
  cache?.set(pipeId, role);
  return role;
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
