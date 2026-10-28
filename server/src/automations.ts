import { z } from "zod";
import { and, eq, inArray, isNull, lt } from "drizzle-orm";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { db } from "./db/client.js";
import { automationLogs, automationRules, cardAssignees, cardEvents, cardFields, cards, fields, phases, pipes } from "./db/schema.js";
import { evalExpression, OPERATORS } from "./conditions.js";
import { linkedFrom, readSettings } from "./connections.js";
import { createCard, moveCard, onCardHappening, setFieldValue, type Actor, type CardHappening } from "./cardService.js";
import { evaluate, FormulaError, type FValue } from "./formula.js";
import { sweepAlerts } from "./slaService.js";

/**
 * Automation engine (M5): "quando → se → então".
 * A rule listens to one card event in its pipe, checks its conditions on the card's
 * values (same evaluator as the conditionals) and runs its actions in order through
 * cardService — so automations obey the same rules as people (required fields,
 * pai/filho), except "Mover para", which automations may skip (as in the original).
 * Every evaluation is logged; no usage limits.
 */

export const TRIGGERS = ["card_created", "card_entered_phase", "card_left_phase", "field_updated", "scheduled", "children_in_phase", "alert"] as const;
export const trigger = z.object({
  type: z.enum(TRIGGERS),
  // entered/left: required; created/scheduled: optional (scheduled = only cards in it);
  // children_in_phase: a phase of the CHILD pipe
  phaseId: z.string().optional(),
  fieldId: z.string().optional(), // field_updated: optional (any field when absent)
  // scheduled (Brasília time): every hour; daily at `time`; weekly on `weekdays` (0 = domingo) at `time`
  frequency: z.enum(["hourly", "daily", "weekly"]).optional(),
  time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).optional(),
  weekdays: z.array(z.number().int().min(0).max(6)).max(7).optional(),
  // alert: which alert (any when absent); phaseId optional = only cards in that phase
  alertKind: z.enum(["late", "expired", "overdue"]).optional(),
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
  // Result of a formula (see formula.ts) written into a field. {Field name} references.
  z.object({ type: z.literal("formula"), fieldId: z.string(), expression: z.string().min(1).max(2000) }),
  // Call another system. {Field name} in url/headers/body is replaced by the card's value.
  z.object({
    type: z.literal("http"),
    method: z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]),
    url: z.string().url().max(2000),
    headers: z.array(z.object({ name: z.string().min(1).max(200), value: z.string().max(2000) })).max(20).default([]),
    body: z.string().max(20_000).optional(),
    saveToFieldId: z.string().optional(), // text field that receives the response (first 2000 chars)
  }),
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
        await db.update(automationRules).set({ state: { ...((rule.state as object | null) ?? {}), cursor: next } }).where(eq(automationRules.id, rule.id));
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
    case "formula": {
      const target = (await db.select().from(fields).where(eq(fields.id, a.fieldId)).limit(1))[0];
      if (!target || target.pipeId !== card.pipeId) throw new Error("campo de destino não existe mais");
      const result = evaluate(a.expression, await refResolver(card.pipeId, card.id));
      const value = coerceTo(target.type, result);
      await setFieldValue({ card, fieldId: target.id, value, orgId, actor, checkEditable: false });
      return `fórmula: "${target.label}" = ${String(value)}`;
    }
    case "http": {
      const fill = await templater(card.pipeId, card.id);
      const url = fill(a.url, encodeURIComponent);
      await assertPublicUrl(url);
      const res = await fetch(url, {
        method: a.method,
        headers: Object.fromEntries(a.headers.map((h) => [h.name, fill(h.value, (x) => x)])),
        body: a.method === "GET" || a.method === "DELETE" || !a.body ? undefined : fill(a.body, (x) => JSON.stringify(x).slice(1, -1)),
        redirect: "manual", // a redirect could point inside the network
        signal: AbortSignal.timeout(10_000),
      });
      const text = (await res.text()).slice(0, 2000);
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
      if (a.saveToFieldId) await setFieldValue({ card, fieldId: a.saveToFieldId, value: text, orgId, actor, checkEditable: false });
      return `HTTP ${res.status}`;
    }
  }
}

/** Formula references {Field name} → the card's value, by label (case-insensitive). */
async function refResolver(pipeId: string, cardId: string): Promise<(name: string) => FValue> {
  const defs = await db.select({ id: fields.id, label: fields.label, type: fields.type }).from(fields).where(eq(fields.pipeId, pipeId));
  const values = await valuesOf(cardId);
  return (name) => {
    const f = defs.find((d) => d.label.trim().toLowerCase() === name.toLowerCase());
    if (!f) throw new FormulaError(`campo "${name}" não existe neste pipe`);
    const v = values[f.id];
    if (v === undefined || v === null || v === "") return null;
    if (Array.isArray(v)) return v.length; // lists count their items
    if (typeof v === "string" && ["date", "due_date", "datetime"].includes(f.type)) return v.slice(0, 10);
    return v as FValue;
  };
}

/** The formula result shaped for the destination field. */
function coerceTo(type: string, v: FValue): unknown {
  if (v === null) return null;
  if (["number", "currency"].includes(type)) {
    if (typeof v !== "number") throw new FormulaError("o resultado não é um número");
    return Math.round(v * 1e6) / 1e6;
  }
  if (["date", "due_date"].includes(type)) {
    if (typeof v !== "string") throw new FormulaError("o resultado não é uma data");
    return v;
  }
  if (type === "checkbox") return v === true || v === 1;
  if (["short_text", "long_text"].includes(type)) return typeof v === "number" ? String(Math.round(v * 1e6) / 1e6) : String(v);
  throw new FormulaError("campo de destino precisa ser número, moeda, data, Sim/Não ou texto");
}

/** {Field name} in http url/headers/body → the card's value (escaped by `esc`). */
async function templater(pipeId: string, cardId: string) {
  const defs = await db.select({ id: fields.id, label: fields.label }).from(fields).where(eq(fields.pipeId, pipeId));
  const values = await valuesOf(cardId);
  const card = (await db.select({ number: cards.number, title: cards.title }).from(cards).where(eq(cards.id, cardId)).limit(1))[0];
  return (tpl: string, esc: (s: string) => string) =>
    tpl.replace(/\{([^}]*)\}/g, (_m, raw: string) => {
      const name = raw.trim().toLowerCase();
      if (name === "#" || name === "id do card") return esc(String(card?.number ?? ""));
      if (name === "título" || name === "titulo") return esc(card?.title ?? "");
      const f = defs.find((d) => d.label.trim().toLowerCase() === name);
      const v = f ? values[f.id] : undefined;
      return esc(v === undefined || v === null ? "" : Array.isArray(v) ? v.join(", ") : String(v));
    });
}

/** Loopback, private, link-local (169.254 = cloud metadata) and ULA addresses. */
export const isInternalIp = (ip: string) =>
  /^(127\.|10\.|192\.168\.|169\.254\.|0\.)/.test(ip) || /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
  ip === "::1" || /^f[cd]/i.test(ip) || /^fe80/i.test(ip) || ip.startsWith("::ffff:127.") || ip.startsWith("::ffff:10.");

/** Block calls into the VM or the private network (incl. the cloud metadata service). */
async function assertPublicUrl(url: string) {
  const u = new URL(url);
  if (!["http:", "https:"].includes(u.protocol)) throw new Error("só http/https");
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host) ? [host] : (await lookup(host, { all: true })).map((a) => a.address);
  if (addrs.some(isInternalIp)) throw new Error("endereço interno bloqueado por segurança");
}

const matches = (t: Trigger, e: CardHappening) =>
  t.type === e.kind &&
  (e.kind !== "alert" || !t.alertKind || t.alertKind === e.alertKind) &&
  (!t.phaseId || t.phaseId === e.phaseId) &&
  (e.kind !== "field_updated" || !t.fieldId || t.fieldId === e.fieldId);

async function log(ruleId: string, cardId: string | null, status: "success" | "failed" | "skipped", message: string, started: number) {
  await db.insert(automationLogs).values({ id: crypto.randomUUID(), ruleId, cardId, status, message, durationMs: Date.now() - started });
  await db.update(automationRules).set({ lastRunAt: new Date(), lastStatus: status, lastError: status === "failed" ? message : null }).where(eq(automationRules.id, ruleId));
}

/** Evaluate and run one rule on one card. `dryRun` only reports what would happen. */
export async function runRule(rule: typeof automationRules.$inferSelect, cardId: string, depth: number, dryRun = false, quietSkip = false) {
  const started = Date.now();
  const orgId = (await db.select({ orgId: pipes.orgId }).from(pipes).where(eq(pipes.id, rule.pipeId)).limit(1))[0]?.orgId;
  if (!orgId) return { status: "failed" as const, message: "pipe não encontrado" };
  const groups = conditionGroups.safeParse(rule.groups).success ? (rule.groups as Parameters<typeof evalExpression>[0]) : [];
  const ok = evalExpression(groups, await valuesOf(cardId));
  if (!ok) {
    if (!dryRun && !quietSkip) await log(rule.id, cardId, "skipped", "condições não atendidas", started);
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
  if (e.kind === "card_entered_phase" && e.depth < MAX_DEPTH) await childrenArrived(e);
}

/** "Todos os filhos chegaram na fase": when a child enters a phase, each of its parents
 *  with such a rule fires once every child connected to it (from this pipe) is there. */
async function childrenArrived(e: CardHappening) {
  const orgId = (await db.select({ orgId: pipes.orgId }).from(pipes).where(eq(pipes.id, e.pipeId)).limit(1))[0]?.orgId;
  if (!orgId) return;
  for (const parent of await linkedFrom(e.cardId, orgId)) {
    const rules = (await db.select().from(automationRules).where(and(eq(automationRules.pipeId, parent.pipeId), eq(automationRules.active, true))))
      .filter((r) => { const t = trigger.safeParse(r.trigger); return t.success && t.data.type === "children_in_phase" && t.data.phaseId === e.phaseId; });
    if (!rules.length) continue;
    // Children of this parent in the child's pipe, through its connection fields.
    const conns = await db.select().from(fields).where(and(eq(fields.pipeId, parent.pipeId), eq(fields.type, "connection")));
    const ids = new Set<string>();
    for (const c of conns) {
      const s = readSettings(c.settings);
      if (s?.target !== "pipe" || s.targetId !== e.pipeId) continue;
      const row = (await db.select().from(cardFields).where(and(eq(cardFields.cardId, parent.cardId), eq(cardFields.fieldId, c.id))).limit(1))[0];
      if (Array.isArray(row?.value)) (row!.value as string[]).forEach((id) => ids.add(id));
    }
    if (!ids.size) continue;
    const kids = await db.select({ phase: cards.currentPhaseId }).from(cards).where(and(inArray(cards.id, [...ids]), isNull(cards.deletedAt)));
    if (kids.length && kids.every((k) => k.phase === e.phaseId)) {
      for (const rule of rules) await runRule(rule, parent.cardId, e.depth);
    }
  }
}

// --- scheduler -------------------------------------------------------------------
const BR = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23",
});
const WEEKDAY: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const SCHEDULE_BATCH = 300; // cards per run, as in the original

/** The slot a scheduled rule is due for right now (Brasília time), or null. */
export function dueSlot(t: Trigger, now = new Date()): string | null {
  const parts = Object.fromEntries(BR.formatToParts(now).map((x) => [x.type, x.value]));
  const day = `${parts.year}-${parts.month}-${parts.day}`;
  const hm = `${parts.hour}:${parts.minute}`;
  if (t.frequency === "hourly") return `${day}T${parts.hour}`;
  if (!t.time || hm < t.time) return null;
  if (t.frequency === "daily") return day;
  if (t.frequency === "weekly" && (t.weekdays ?? []).includes(WEEKDAY[parts.weekday])) return day;
  return null;
}

let lastPrune = "";
/** Once a minute: run due scheduled rules; once a day, drop logs older than 90 days. */
async function tick() {
  const rules = await db.select().from(automationRules).where(eq(automationRules.active, true));
  for (const rule of rules) {
    const t = trigger.safeParse(rule.trigger);
    if (!t.success || t.data.type !== "scheduled") continue;
    const slot = dueSlot(t.data);
    const state = (rule.state as { slot?: string } | null) ?? {};
    if (!slot || state.slot === slot) continue;
    // Claim the slot first, so a slow run is not started twice.
    await db.update(automationRules).set({ state: { ...state, slot } }).where(eq(automationRules.id, rule.id));
    const where = t.data.phaseId
      ? and(eq(cards.pipeId, rule.pipeId), isNull(cards.deletedAt), eq(cards.currentPhaseId, t.data.phaseId))
      : and(eq(cards.pipeId, rule.pipeId), isNull(cards.deletedAt));
    const batch = await db.select({ id: cards.id }).from(cards).where(where).limit(SCHEDULE_BATCH);
    for (const c of batch) await runRule({ ...rule, state: { ...state, slot } }, c.id, 0, false, true);
  }
  const today = new Date().toISOString().slice(0, 10);
  if (lastPrune !== today) {
    lastPrune = today;
    await db.delete(automationLogs).where(lt(automationLogs.createdAt, new Date(Date.now() - 90 * 86_400_000)));
  }
}

export function startAutomations() {
  onCardHappening(onEvent);
  setInterval(() => {
    sweepAlerts().catch((err) => console.error("alert sweep failed:", err));
    tick().catch((err) => console.error("automation tick failed:", err));
  }, 60_000);
}

