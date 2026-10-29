import { z } from "zod";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../../db/client.js";
import { automationLogs, automationRules, cards, emailTemplates, fields, phases, pipes } from "../../db/schema.js";
import { router, adminProcedure, assertPipeInOrg } from "../trpc.js";
import { action, conditionGroups, runRule, trigger, type Action } from "../../automations.js";
import { readSettings } from "../../connections.js";

const body = {
  name: z.string().trim().min(1).max(255),
  trigger,
  groups: conditionGroups,
  actions: z.array(action).min(1).max(20),
};
type Body = { trigger: z.infer<typeof trigger>; groups: z.infer<typeof conditionGroups>; actions: Action[] };

/** Every id a rule mentions must belong to the pipe (or the connected pipe, for its targets). */
async function checkRefs(pipeId: string, orgId: string, b: Body) {
  const bad = (m: string) => new TRPCError({ code: "BAD_REQUEST", message: m });
  const ph = await db.select({ id: phases.id }).from(phases).where(eq(phases.pipeId, pipeId));
  const fl = await db.select({ id: fields.id, type: fields.type, settings: fields.settings }).from(fields).where(eq(fields.pipeId, pipeId));
  const hasPhase = (id?: string) => !id || ph.some((p) => p.id === id);
  const field = (id?: string) => fl.find((f) => f.id === id);
  const t = b.trigger;
  if (["card_entered_phase", "card_left_phase", "children_in_phase"].includes(t.type) && !t.phaseId) throw bad("Escolha a fase do gatilho.");
  if (t.type === "children_in_phase") {
    // The phase belongs to the CHILD pipe (another pipe of the org).
    const p = (await db.select({ orgId: pipes.orgId, pipeId: phases.pipeId }).from(phases).innerJoin(pipes, eq(pipes.id, phases.pipeId)).where(eq(phases.id, t.phaseId!)).limit(1))[0];
    if (p?.orgId !== orgId) throw bad("Fase dos filhos inválida.");
  } else if (!hasPhase(t.phaseId) || (t.fieldId && !field(t.fieldId))) throw bad("Gatilho aponta para fase ou campo de outro pipe.");
  if (t.type === "scheduled") {
    if (!t.frequency) throw bad("Escolha a frequência.");
    if (t.frequency !== "hourly" && !t.time) throw bad("Escolha o horário.");
    if (t.frequency === "weekly" && !t.weekdays?.length) throw bad("Escolha ao menos um dia da semana.");
  }
  for (const g of b.groups) for (const r of g) if (!field(r.fieldId)) throw bad("Condição usa campo de outro pipe.");
  for (const a of b.actions) {
    if (a.type === "move_card" && !hasPhase(a.phaseId)) throw bad("Mover card: fase de outro pipe.");
    if (a.type === "update_field") {
      const f = field(a.fieldId);
      if (!f || ["connection", "attachment", "id"].includes(f.type)) throw bad("Atualizar campo: escolha um campo editável deste pipe.");
      if ((a.mode === "copy" && !field(a.fromFieldId)) || (a.mode === "date_offset" && a.fromFieldId && !field(a.fromFieldId))) throw bad("Atualizar campo: campo de origem inválido.");
      if (a.mode === "date_offset" && !["date", "due_date"].includes(f.type)) throw bad("Data relativa só vale para campos de data.");
    }
    if (a.type === "create_connected_card") {
      const conn = field(a.connectionFieldId);
      const s = conn ? readSettings(conn.settings) : null;
      if (!conn || conn.type !== "connection" || !s || s.target !== "pipe") throw bad("Criar card conectado: escolha um campo de conexão com outro pipe.");
      const targetFields = await db.select({ id: fields.id }).from(fields).where(eq(fields.pipeId, s.targetId));
      for (const m of a.values) {
        if (!targetFields.some((t) => t.id === m.toFieldId) || (m.fromFieldId && !field(m.fromFieldId))) throw bad("Criar card conectado: mapeamento inválido.");
      }
    }
    if (a.type === "formula") {
      const f = field(a.fieldId);
      if (!f || !["number", "currency", "date", "due_date", "checkbox", "short_text", "long_text"].includes(f.type)) {
        throw bad("Fórmula: o destino precisa ser número, moeda, data, Sim/Não ou texto.");
      }
    }
    if (a.type === "http" && a.saveToFieldId) {
      const f = field(a.saveToFieldId);
      if (!f || !["short_text", "long_text"].includes(f.type)) throw bad("HTTP: a resposta só pode ir para um campo de texto.");
    }
    if (a.type === "send_email") {
      const t = (await db.select({ pipeId: emailTemplates.pipeId }).from(emailTemplates).where(eq(emailTemplates.id, a.templateId)).limit(1))[0];
      if (t?.pipeId !== pipeId) throw bad("Enviar e-mail: escolha um template deste pipe.");
    }
    if (a.type === "move_parent") {
      const p = (await db.select({ orgId: pipes.orgId }).from(phases).innerJoin(pipes, eq(pipes.id, phases.pipeId)).where(eq(phases.id, a.phaseId)).limit(1))[0];
      if (p?.orgId !== orgId) throw bad("Mover pai: fase inválida.");
    }
  }
}

async function ruleInOrg(ruleId: string, orgId: string) {
  const r = (await db.select().from(automationRules).where(eq(automationRules.id, ruleId)).limit(1))[0];
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Automação não encontrada" });
  await assertPipeInOrg(r.pipeId, orgId);
  return r;
}

/** Automations are pipe configuration: admins only (decision 2026-10-28). */
export const automationRouter = router({
  list: adminProcedure.input(z.object({ pipeId: z.string() })).query(async ({ ctx, input }) => {
    await assertPipeInOrg(input.pipeId, ctx.orgId);
    return db.select().from(automationRules).where(eq(automationRules.pipeId, input.pipeId)).orderBy(desc(automationRules.createdAt));
  }),

  create: adminProcedure.input(z.object({ pipeId: z.string(), ...body })).mutation(async ({ ctx, input }) => {
    await assertPipeInOrg(input.pipeId, ctx.orgId);
    await checkRefs(input.pipeId, ctx.orgId, input);
    const id = crypto.randomUUID();
    await db.insert(automationRules).values({ id, pipeId: input.pipeId, name: input.name, trigger: input.trigger, groups: input.groups, actions: input.actions, createdBy: ctx.userId });
    return { id };
  }),

  update: adminProcedure.input(z.object({ ruleId: z.string(), ...body })).mutation(async ({ ctx, input }) => {
    const r = await ruleInOrg(input.ruleId, ctx.orgId);
    await checkRefs(r.pipeId, ctx.orgId, input);
    await db.update(automationRules).set({ name: input.name, trigger: input.trigger, groups: input.groups, actions: input.actions, state: null }).where(eq(automationRules.id, r.id));
    return { ok: true };
  }),

  setActive: adminProcedure.input(z.object({ ruleId: z.string(), active: z.boolean() })).mutation(async ({ ctx, input }) => {
    const r = await ruleInOrg(input.ruleId, ctx.orgId);
    await db.update(automationRules).set({ active: input.active }).where(eq(automationRules.id, r.id));
    return { ok: true };
  }),

  /** The copy starts inactive, to avoid two rules doing the same thing. */
  duplicate: adminProcedure.input(z.object({ ruleId: z.string() })).mutation(async ({ ctx, input }) => {
    const r = await ruleInOrg(input.ruleId, ctx.orgId);
    const id = crypto.randomUUID();
    await db.insert(automationRules).values({ id, pipeId: r.pipeId, name: `${r.name} (cópia)`.slice(0, 255), active: false, trigger: r.trigger, groups: r.groups, actions: r.actions, createdBy: ctx.userId });
    return { id };
  }),

  remove: adminProcedure.input(z.object({ ruleId: z.string() })).mutation(async ({ ctx, input }) => {
    const r = await ruleInOrg(input.ruleId, ctx.orgId);
    await db.delete(automationLogs).where(eq(automationLogs.ruleId, r.id));
    await db.delete(automationRules).where(eq(automationRules.id, r.id));
    return { ok: true };
  }),

  /** Last runs of a rule (newest first), with the card number. */
  logs: adminProcedure.input(z.object({ ruleId: z.string() })).query(async ({ ctx, input }) => {
    const r = await ruleInOrg(input.ruleId, ctx.orgId);
    const rows = await db.select().from(automationLogs).where(eq(automationLogs.ruleId, r.id)).orderBy(desc(automationLogs.createdAt)).limit(100);
    const ids = [...new Set(rows.map((l) => l.cardId).filter((x): x is string => !!x))];
    const nums = ids.length ? await db.select({ id: cards.id, number: cards.number, title: cards.title }).from(cards).where(inArray(cards.id, ids)) : [];
    return rows.map((l) => ({ ...l, card: nums.find((n) => n.id === l.cardId) ?? null }));
  }),

  /** "Testar regra": dry run on a card (#number) — says whether it would run, changes nothing.
   *  `execute` runs it for real on that card. */
  test: adminProcedure.input(z.object({ ruleId: z.string(), cardNumber: z.number().int().positive(), execute: z.boolean().default(false) })).mutation(async ({ ctx, input }) => {
    const r = await ruleInOrg(input.ruleId, ctx.orgId);
    const card = (await db.select().from(cards).where(and(eq(cards.pipeId, r.pipeId), eq(cards.number, input.cardNumber), isNull(cards.deletedAt))).limit(1))[0];
    if (!card) throw new TRPCError({ code: "NOT_FOUND", message: `Card #${input.cardNumber} não encontrado neste pipe.` });
    return runRule(r, card.id, 0, !input.execute);
  }),

  /** Rules whose last run failed, across the org (for the warnings on Home/board). */
  failures: adminProcedure.query(({ ctx }) =>
    db.select({ ruleId: automationRules.id, name: automationRules.name, pipeId: pipes.id, pipeName: pipes.name, lastError: automationRules.lastError, lastRunAt: automationRules.lastRunAt })
      .from(automationRules).innerJoin(pipes, eq(pipes.id, automationRules.pipeId))
      .where(and(eq(pipes.orgId, ctx.orgId), eq(automationRules.active, true), eq(automationRules.lastStatus, "failed"), isNull(pipes.deletedAt)))
      .orderBy(desc(automationRules.lastRunAt))
  ),
});
