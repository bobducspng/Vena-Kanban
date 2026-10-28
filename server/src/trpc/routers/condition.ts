import { z } from "zod";
import { eq, asc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../../db/client.js";
import { fieldConditions, fields, phases } from "../../db/schema.js";
import { router, protectedProcedure, adminProcedure, assertPipeInOrg } from "../trpc.js";
import { OPERATORS, ACTIONS, VALUELESS } from "../../conditions.js";

const rule = z.object({
  fieldId: z.string(),
  operator: z.enum(OPERATORS),
  value: z.union([z.string().max(500), z.number(), z.null()]).optional(),
});
const action = z.object({ fieldId: z.string(), action: z.enum(ACTIONS) });
const body = {
  name: z.string().trim().min(1).max(255),
  groups: z.array(z.array(rule).min(1).max(50)).min(1).max(20),
  onTrue: z.array(action).max(300),
  onFalse: z.array(action).max(300),
};

type Body = { groups: z.infer<typeof rule>[][]; onTrue: z.infer<typeof action>[]; onFalse: z.infer<typeof action>[] };

/** Sources: fields of this phase or earlier ones. Targets: fields of this phase. */
async function checkRefs(phaseId: string, b: Body) {
  const phase = (await db.select().from(phases).where(eq(phases.id, phaseId)).limit(1))[0];
  if (!phase) throw new TRPCError({ code: "NOT_FOUND", message: "Fase não encontrada" });
  const pipePhases = await db.select({ id: phases.id, position: phases.position }).from(phases).where(eq(phases.pipeId, phase.pipeId));
  const pos = new Map(pipePhases.map((p) => [p.id, p.position]));
  const pipeFields = await db.select({ id: fields.id, phaseId: fields.phaseId }).from(fields).where(eq(fields.pipeId, phase.pipeId));
  const byId = new Map(pipeFields.map((f) => [f.id, f]));
  for (const g of b.groups) for (const r of g) {
    const f = byId.get(r.fieldId);
    if (!f || (pos.get(f.phaseId) ?? 0) > phase.position) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "A condição só pode usar campos desta fase ou de fases anteriores." });
    }
    if (!VALUELESS.has(r.operator) && (r.value === undefined || r.value === null || r.value === "")) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Informe o valor de comparação." });
    }
  }
  for (const a of [...b.onTrue, ...b.onFalse]) {
    if (byId.get(a.fieldId)?.phaseId !== phaseId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "As ações só podem mudar campos desta fase." });
    }
  }
  if (b.onTrue.length + b.onFalse.length === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "Escolha ao menos uma ação." });
  return phase;
}

async function conditionInOrg(id: string, orgId: string) {
  const c = (await db.select().from(fieldConditions).where(eq(fieldConditions.id, id)).limit(1))[0];
  if (!c) throw new TRPCError({ code: "NOT_FOUND", message: "Condicional não encontrada" });
  await assertPipeInOrg(c.pipeId, orgId);
  return c;
}

export const conditionRouter = router({
  // Everyone reads them (forms need them); only admins change them.
  listByPipe: protectedProcedure.input(z.object({ pipeId: z.string() })).query(async ({ ctx, input }) => {
    await assertPipeInOrg(input.pipeId, ctx.orgId);
    return db.select().from(fieldConditions).where(eq(fieldConditions.pipeId, input.pipeId)).orderBy(asc(fieldConditions.position));
  }),

  create: adminProcedure.input(z.object({ phaseId: z.string(), ...body })).mutation(async ({ ctx, input }) => {
    const phase = await checkRefs(input.phaseId, input);
    await assertPipeInOrg(phase.pipeId, ctx.orgId);
    const [{ max }] = await db.select({ max: sql<number | null>`MAX(${fieldConditions.position})` })
      .from(fieldConditions).where(eq(fieldConditions.phaseId, phase.id));
    const id = crypto.randomUUID();
    await db.insert(fieldConditions).values({
      id, pipeId: phase.pipeId, phaseId: phase.id, name: input.name, position: (max ?? -1) + 1,
      groups: input.groups, onTrue: input.onTrue, onFalse: input.onFalse,
    });
    return { id };
  }),

  update: adminProcedure.input(z.object({ conditionId: z.string(), ...body })).mutation(async ({ ctx, input }) => {
    const c = await conditionInOrg(input.conditionId, ctx.orgId);
    await checkRefs(c.phaseId, input);
    await db.update(fieldConditions)
      .set({ name: input.name, groups: input.groups, onTrue: input.onTrue, onFalse: input.onFalse })
      .where(eq(fieldConditions.id, c.id));
    return { ok: true };
  }),

  /** Order matters: later conditions win over earlier ones. */
  move: adminProcedure.input(z.object({ conditionId: z.string(), dir: z.union([z.literal(-1), z.literal(1)]) })).mutation(async ({ ctx, input }) => {
    const c = await conditionInOrg(input.conditionId, ctx.orgId);
    const list = await db.select().from(fieldConditions).where(eq(fieldConditions.phaseId, c.phaseId)).orderBy(asc(fieldConditions.position));
    const i = list.findIndex((x) => x.id === c.id);
    const j = i + input.dir;
    if (j < 0 || j >= list.length) return { ok: true };
    [list[i], list[j]] = [list[j], list[i]];
    await db.transaction(async (tx) => {
      for (let k = 0; k < list.length; k++) await tx.update(fieldConditions).set({ position: k }).where(eq(fieldConditions.id, list[k].id));
    });
    return { ok: true };
  }),

  remove: adminProcedure.input(z.object({ conditionId: z.string() })).mutation(async ({ ctx, input }) => {
    const c = await conditionInOrg(input.conditionId, ctx.orgId);
    await db.delete(fieldConditions).where(eq(fieldConditions.id, c.id));
    return { ok: true };
  }),
});
