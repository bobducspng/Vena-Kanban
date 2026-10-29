import { createHmac } from "node:crypto";
import { and, desc, eq, lt, notInArray } from "drizzle-orm";
import { db } from "./db/client.js";
import { phases, webhookDeliveries, webhooks } from "./db/schema.js";
import { onCardHappening, type CardHappening } from "./cardService.js";
import { assertPublicUrl } from "./automations.js";
import { cardSnapshot } from "./cardSnapshot.js";
import { unseal } from "./driveBackup.js";

/**
 * Webhooks de saída (M13): when something happens to a card, every active webhook of
 * its pipe that listens to that event receives a POST with JSON:
 *   { event, sentAt, webhookId, card: {...}, phase?, previousPhase?, field? }
 * Header X-Venaflow-Signature: sha256=<HMAC-SHA256 of the raw body with the webhook secret>.
 * Delivery runs in the background with up to 3 attempts (now, +30 s, +5 min).
 */

export const WEBHOOK_EVENTS = {
  "card.created": "Card criado",
  "card.moved": "Card mudou de fase",
  "card.done": "Card concluído (chegou numa fase final)",
  "card.field_updated": "Campo alterado",
  "card.alert": "Alerta de prazo (atrasado, expirado ou vencido)",
} as const;
export type WebhookEvent = keyof typeof WEBHOOK_EVENTS;
const RETRIES = [0, 30_000, 5 * 60_000];
const KEEP = 100; // deliveries kept per webhook

export const sign = (secret: string, body: string) => `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;

async function eventsOf(e: CardHappening): Promise<{ event: WebhookEvent; extra: Record<string, unknown> }[]> {
  switch (e.kind) {
    case "card_created": return [{ event: "card.created", extra: {} }];
    case "card_entered_phase": {
      const ph = e.phaseId ? (await db.select({ id: phases.id, name: phases.name, isEnd: phases.isEnd }).from(phases).where(eq(phases.id, e.phaseId)).limit(1))[0] : undefined;
      const extra = { phase: ph ? { id: ph.id, name: ph.name } : null };
      return [{ event: "card.moved", extra }, ...(ph?.isEnd ? [{ event: "card.done" as const, extra }] : [])];
    }
    case "field_updated": return [{ event: "card.field_updated", extra: { fieldId: e.fieldId } }];
    case "alert": return [{ event: "card.alert", extra: { alert: e.alertKind } }];
    default: return [];
  }
}

async function deliver(hook: typeof webhooks.$inferSelect, event: string, cardId: string | null, payload: Record<string, unknown>, attempt = 1): Promise<void> {
  const body = JSON.stringify({ event, sentAt: new Date().toISOString(), webhookId: hook.id, ...payload });
  const started = Date.now();
  let httpStatus: number | null = null, error: string | null = null;
  try {
    await assertPublicUrl(hook.url);
    const r = await fetch(hook.url, {
      method: "POST", redirect: "manual", signal: AbortSignal.timeout(15_000),
      headers: { "Content-Type": "application/json", "User-Agent": "Venaflow-Webhook/1", "X-Venaflow-Event": event, "X-Venaflow-Signature": sign(unseal(hook.secret), body) },
      body,
    });
    httpStatus = r.status;
    if (r.status >= 300) error = `respondeu ${r.status}`;
  } catch (err) {
    error = err instanceof Error ? err.message : String(err);
  }
  const ok = !error;
  if (!ok && attempt < RETRIES.length) {
    setTimeout(() => void deliver(hook, event, cardId, payload, attempt + 1), RETRIES[attempt]);
    return;
  }
  await db.insert(webhookDeliveries).values({
    id: crypto.randomUUID(), webhookId: hook.id, event, cardId, status: ok ? "ok" : "failed", httpStatus, error: error?.slice(0, 500) ?? null, attempts: attempt, durationMs: Date.now() - started,
  });
  // Keep the log short.
  const keep = (await db.select({ id: webhookDeliveries.id }).from(webhookDeliveries).where(eq(webhookDeliveries.webhookId, hook.id)).orderBy(desc(webhookDeliveries.createdAt)).limit(KEEP)).map((r) => r.id);
  if (keep.length === KEEP) await db.delete(webhookDeliveries).where(and(eq(webhookDeliveries.webhookId, hook.id), notInArray(webhookDeliveries.id, keep), lt(webhookDeliveries.createdAt, new Date())));
}

async function onEvent(e: CardHappening) {
  const hooks = (await db.select().from(webhooks).where(and(eq(webhooks.pipeId, e.pipeId), eq(webhooks.active, true))));
  if (!hooks.length) return;
  const evs = await eventsOf(e);
  const targets = hooks.flatMap((h) => evs.filter((x) => (h.events as string[]).includes(x.event)).map((x) => ({ h, ...x })));
  if (!targets.length) return;
  const card = await cardSnapshot(e.cardId);
  // Background: the person's action does not wait for other systems.
  for (const t of targets) void deliver(t.h, t.event, e.cardId, { card, ...t.extra }).catch((err) => console.error("webhook failed:", err));
}

/** "Testar": a sample delivery, waiting for the answer. */
export async function testWebhook(hookId: string) {
  const hook = (await db.select().from(webhooks).where(eq(webhooks.id, hookId)).limit(1))[0];
  if (!hook) throw new Error("webhook não encontrado");
  await deliver(hook, "ping", null, { message: "Teste do Venaflow: se você recebeu isto, o webhook está funcionando." }, RETRIES.length);
  return (await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.webhookId, hookId)).orderBy(desc(webhookDeliveries.createdAt)).limit(1))[0];
}

export function startWebhooks() { onCardHappening(onEvent); }
