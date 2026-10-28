import { and, eq, inArray, lt } from "drizzle-orm";
import { db } from "./db/client.js";
import { cards, memberships, notifications, users } from "./db/schema.js";

/**
 * In-app notifications (sino). One place that writes them, so every producer
 * (comments, assignments, alerts, automations) words them the same way.
 * Never throws: a failed notification must not break the action that caused it.
 */

type Kind = "mention" | "assigned" | "late" | "expired" | "overdue" | "automation_failed";

async function write(userIds: string[], n: { type: Kind; title: string; body?: string; cardId?: string; pipeId?: string; link?: string }, exceptUserId?: string | null) {
  const ids = [...new Set(userIds)].filter((u) => u && u !== exceptUserId);
  if (!ids.length) return;
  try {
    await db.insert(notifications).values(ids.map((userId) => ({ id: crypto.randomUUID(), userId, ...n })));
  } catch (err) {
    console.error("notify failed:", err);
  }
}

async function cardLabel(cardId: string) {
  const c = (await db.select({ number: cards.number, title: cards.title, pipeId: cards.pipeId }).from(cards).where(eq(cards.id, cardId)).limit(1))[0];
  return c ? { text: `#${c.number} · ${c.title}`, pipeId: c.pipeId } : { text: "um card", pipeId: undefined };
}
async function nameOf(userId: string | null | undefined) {
  if (!userId) return null;
  return (await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1))[0]?.name ?? null;
}

/** "Fulano mencionou você em #12 · Compra de notebooks". */
export async function notifyMention(userIds: string[], cardId: string, byUserId: string, excerpt: string) {
  const [card, who] = await Promise.all([cardLabel(cardId), nameOf(byUserId)]);
  await write(userIds, { type: "mention", title: `${who ?? "Alguém"} mencionou você`, body: `${card.text}: ${excerpt.slice(0, 200)}`, cardId, pipeId: card.pipeId }, byUserId);
}

/** New responsáveis of a card (manual, automation or phase). */
export async function notifyAssigned(userIds: string[], cardId: string, by: { userId?: string | null; automation?: string; phase?: string }) {
  const card = await cardLabel(cardId);
  const who = by.automation ? `A automação "${by.automation}"` : by.phase ? `A fase "${by.phase}"` : (await nameOf(by.userId)) ?? "Alguém";
  await write(userIds, { type: "assigned", title: `${who} atribuiu você a um card`, body: card.text, cardId, pipeId: card.pipeId }, by.userId);
}

/** Alerts go to the card's responsáveis. */
export async function notifyAlert(assigneeIds: string[], cardId: string, kind: "late" | "expired" | "overdue") {
  const card = await cardLabel(cardId);
  const title = { late: "Card atrasado na fase", expired: "Card expirado", overdue: "Card vencido" }[kind];
  await write(assigneeIds, { type: kind, title, body: card.text, cardId, pipeId: card.pipeId });
}

/** A rule started failing: tell the org's admins (once, not on every run). */
export async function notifyAutomationFailed(orgId: string, pipeId: string, ruleName: string, message: string) {
  const admins = (await db.select({ userId: memberships.userId }).from(memberships).where(and(eq(memberships.orgId, orgId), eq(memberships.role, "admin")))).map((m) => m.userId);
  await write(admins, { type: "automation_failed", title: `Automação "${ruleName}" falhou`, body: message.slice(0, 500), pipeId, link: `/pipes/${pipeId}/automations` });
}

/** Keep the table small: read notifications older than 90 days go away. */
export async function pruneNotifications() {
  await db.delete(notifications).where(and(lt(notifications.createdAt, new Date(Date.now() - 90 * 86_400_000))));
}

export async function markRead(userId: string, ids?: string[]) {
  const where = ids?.length ? and(eq(notifications.userId, userId), inArray(notifications.id, ids)) : eq(notifications.userId, userId);
  await db.update(notifications).set({ readAt: new Date() }).where(where);
}
