import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "./db/client.js";
import { automationLogs, automationRules, cardAssignees, cardEvents, cardFields, cards, fields, phases, pipes } from "./db/schema.js";
import { evalExpression, OPERATORS } from "./conditions.js";
import { linkedFrom, readSettings } from "./connections.js";
import { createCard, moveCard, onCardHappening, setFieldValue, type Actor, type CardHappening } from "./cardService.js";

/**
 * Automation engine (M5): "quando → se → então".
 * A rule listens to one card event in its pipe, checks its conditions on the card's
 * values (same evaluator as the conditionals) and runs its actions in order through
 * cardService — so automations obey the same rules as people (required fields,
 * pai/filho), except "Mover para", which automations may skip (as in the original).
 * Every evaluation is logged; no usage limits.
 */

export const TRIGGERS = ["card_created", "card_entered_phase", "card_left_phase", "field_updated"] as const;
export const trigger = z.object({
  type: z.enum(TRIGGERS),
  phaseId: z.string().optional(), // entered/left: required; created: optional
  fieldId: z.string().optional(), // field_updated: optional (any field when absent)
});

const ruleCond = z.object({ fieldId: z.string(), operator: z.enum(OPERATORS), value: z.union([z.string().max(500), z.number(), z.null()]).optional() });
export const conditionGroups = z.array(z.array(ruleCond).min(1).max(50)).max(20);

const fixed = z.union([z.string().max(2000), z.number(), z.boolean(), z.null(), z.array(z.string().max(255)).max(200)]);
export const action = z.discriminatedUnion("type", [
  z.object({ type: z.literal("move_card"), phaseId: z.string() }),
  z.object({
    type: z.literal("update_field"),
    fieldId: z.string(),
    // fixed value; copy another field of the card; date N days from today/another date field; clear
    mode: z.enum(["fixed", "copy", "date_offset", "clear"]),
    value: fixed.optional(),
    fromFieldId: z.string().optional(),
    days: z.number().int().min(-3650).max(3650).optional(),
  }),
  z.object({ type: z.literal("assign"), mode: z.enum(["round_robin", "random", "set"]), userIds: z.array(z.string()).min(1).max(100) }),
  z.object({
    type: z.literal("create_connected_card"),
    connectionFieldId: z.string(), // a "Conexão" field of this pipe pointing to another pipe
    values: z.array(z.object({ toFieldId: z.string(), fromFieldId: z.string().optional(), value: fixed.optional() })).max(100),
  }),
  z.object({ type: z.literal("move_parent"), phaseId: z.string() }), // phase of the parent's pipe
]);
export type Action = z.infer<typeof action>;
type Trigger = z.infer<typeof trigger>;

const MAX_DEPTH = 5; // automation → automation chains beyond this are stopped (loop guard)

/** Card values as the condition evaluator expects. */
async function valuesOf(cardId: string) {
  const rows = await db.select().from(cardFields).where(eq(cardFields.cardId, cardId));
  return Object.fromEntries(rows.map((r) => [r.fieldId, r.value])) as Parameters<typeof evalExpression>[1];
}

const todayPlus = (days: number, base?: string) => {
  const d = base ? new Date(`${base.slice(0, 10)}T12:00:00`) : new Date();
  d.setDate(d.getDate() + days);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
};

/** Run one action on the card. Throws (with a readable message) on failure. */
async function runAction(rule: typeof automationRules.$inferSelect, a: Action, cardId: string, actor: Actor, orgId: string): Promise<string> {
  const card = (await db.select().from(cards).where(eq(cards.id, cardId)).limit(1))[0];
  if (!card || card.deletedAt) throw new Error("card não existe mais");

  switch (a.type) {
    case "move_card": {
      const to = (await db.select().from(phases).where(eq(phases.id, a.phaseId)).limit(1))[0];
      if (!to) throw new Error("fase de destino não existe mais");
      await moveCard({ card, toPhaseId: a.phaseId, actor, checkTransition: false });
      return `moveu para ${to.name}`;
    }
    case "update_field": {
      const values = await valuesOf(card.id);
      let value: unknown;
      if (a.mode === "fixed") value = a.value ?? null;
      else if (a.mode === "clear") value = null;
      else if (a.mode === "copy") value = a.fromFieldId ? values[a.fromFieldId] ?? null : null;
      else {
        const base = a.fromFieldId ? values[a.fromFieldId] : undefined;
        if (a.fromFieldId && (typeof base !== "string" || !base)) throw new Error("data de referência vazia");
        value = todayPlus(a.days ?? 0, typeof base === "string" ? base : undefined);
      }
      await setFieldValue({ card, fieldId: a.fieldId, value, orgId, actor, checkEditable: false });
      const f = (await db.select({ label: fields.label }).from(fields).where(eq(fields.id, a.fieldId)).limit(1))[0];
      return `atualizou "${f?.label ?? "campo"}"`;
    }
    case "assign": {
      let chosen: string[];
      if (a.mode === "set") chosen = a.userIds;
      else if (a.mode === "random") chosen = [a.userIds[Math.floor(Math.random() * a.userIds.length)]];
      else {
        // Round-robin: next person after the last one, remembered on the rule.
        const cursor = Number((rule.state as { cursor?: number } | null)?.cursor ?? -1);
        const next = (cursor + 1) % a.userIds.length;
        await db.update(automationRules).set({ state: { cursor: next } }).where(eq(automationRules.id, rule.id));
        chosen = [a.userIds[next]];
      }
      await db.delete(cardAssignees).where(eq(cardAssignees.cardId, card.id));
      await db.insert(cardAssignees).values(chosen.map((userId) => ({ cardId: card.id, userId })));
      await db.insert(cardEvents).values({ id: crypto.randomUUID(), cardId: card.id, type: "assignees_changed", actorId: null, data: { userIds: chosen, automation: actor.automation } });
      return "definiu responsável";
    }
    case "create_connected_card": {
      const conn = (await db.select().from(fields).where(eq(fields.id, a.connectionFieldId)).limit(1))[0];
      const s = conn ? readSettings(conn.settings) : null;
      if (!conn || conn.pipeId !== card.pipeId || !s || s.target !== "pipe") throw new Error("campo de conexão inválido");
      const values = await valuesOf(card.id);
      const mapped = a.values.map((m) => ({ fieldId: m.toFieldId, value: m.fromFieldId ? values[m.fromFieldId] ?? null : m.value ?? null }));
      const childId = await createCard({ pipeId: s.targetId, title: card.title, values: mapped.filter((m) => m.value !== null && m.value !== ""), orgId, actor });
      const current = Array.isArray(values[conn.id]) ? (values[conn.id] as string[]) : [];
      await setFieldValue({ card, fieldId: conn.id, value: s.multiple ? [...current, childId] : [childId], orgId, actor, checkEditable: false });
      const child = (await db.select({ number: cards.number }).from(cards).where(eq(cards.id, childId)).limit(1))[0];
      return `criou o card #${child?.number} conectado`;
    }
    case "move_parent": {
      const to = (await db.select().from(phases).where(eq(phases.id, a.phaseId)).limit(1))[0];
      if (!to) throw new Error("fase de destino não existe mais");
      const parents = (await linkedFrom(card.id, orgId)).filter((p) => p.pipeId === to.pipeId);
      if (!parents.length) throw new Error("card sem pai no pipe da fase escolhida");
      for (const p of parents) {
        const parent = (await db.select().from(cards).where(eq(cards.id, p.cardId)).limit(1))[0];
        if (parent && parent.currentPhaseId !== to.id) await moveCard({ card: parent, toPhaseId: to.id, actor, checkTransition: false });
      }
      return `moveu o pai para ${to.name}`;
    }
  }
}

const matches = (t: Trigger, e: CardHappening) =>
  t.type === e.kind &&
  (!t.phaseId || t.phaseId === e.phaseId) &&
  (e.kind !== "field_updated" || !t.fieldId || t.fieldId === e.fieldId);

async function log(ruleId: string, cardId: string | null, status: "success" | "failed" | "skipped", message: string, started: number) {
  await db.insert(automationLogs).values({ id: crypto.randomUUID(), ruleId, cardId, status, message, durationMs: Date.now() - started });
  await db.update(automationRules).set({ lastRunAt: new Date(), lastStatus: status, lastError: status === "failed" ? message : null }).where(eq(automationRules.id, ruleId));
}

/** Evaluate and run one rule on one card. `dryRun` only reports what would happen. */
export async function runRule(rule: typeof automationRules.$inferSelect, cardId: string, depth: number, dryRun = false) {
  const started = Date.now();
  const orgId = (await db.select({ orgId: pipes.orgId }).from(pipes).where(eq(pipes.id, rule.pipeId)).limit(1))[0]?.orgId;
  if (!orgId) return { status: "failed" as const, message: "pipe não encontrado" };
  const groups = conditionGroups.safeParse(rule.groups).success ? (rule.groups as Parameters<typeof evalExpression>[0]) : [];
  const ok = evalExpression(groups, await valuesOf(cardId));
  if (!ok) {
    if (!dryRun) await log(rule.id, cardId, "skipped", "condições não atendidas", started);
    return { status: "skipped" as const, message: "As condições não foram atendidas neste card." };
  }
  const actions = z.array(action).safeParse(rule.actions);
  if (!actions.success) {
    if (!dryRun) await log(rule.id, cardId, "failed", "ações mal configuradas", started);
    return { status: "failed" as const, message: "Ações mal configuradas." };
  }
  if (dryRun) return { status: "success" as const, message: `As condições batem; ${actions.data.length} ação(ões) seriam executadas.` };

  const actor: Actor = { userId: null, automation: rule.name, depth: depth + 1 };
  const done: string[] = [];
  for (const [i, a] of actions.data.entries()) {
    try {
      done.push(await runAction(rule, a, cardId, actor, orgId));
    } catch (err) {
      const why = err instanceof Error ? err.message : String(err);
      const msg = `Ação ${i + 1} falhou: ${why}${done.length ? ` (antes: ${done.join("; ")})` : ""}`;
      await log(rule.id, cardId, "failed", msg, started);
      return { status: "failed" as const, message: msg };
    }
  }
  const msg = done.join("; ");
  await log(rule.id, cardId, "success", msg, started);
  return { status: "success" as const, message: msg };
}

/** Listener: every card event from cardService lands here. */
async function onEvent(e: CardHappening) {
  const rules = await db.select().from(automationRules).where(and(eq(automationRules.pipeId, e.pipeId), eq(automationRules.active, true)));
  const hits = rules.filter((r) => { const t = trigger.safeParse(r.trigger); return t.success && matches(t.data, e); });
  for (const rule of hits) {
    if (e.depth >= MAX_DEPTH) {
      await log(rule.id, e.cardId, "failed", "Interrompida: cadeia de automações longa demais (possível loop).", Date.now());
      continue;
    }
    await runRule(rule, e.cardId, e.depth);
  }
}

export function startAutomations() {
  onCardHappening(onEvent);
}

