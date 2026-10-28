import { z } from "zod";
import { eq, asc, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../../db/client.js";
import { fields, phases, cardFields } from "../../db/schema.js";
import { router, protectedProcedure, assertPipeInOrg } from "../trpc.js";

// Types the editor offers (and the card form renders).
const fieldType = z.enum([
  "short_text", "long_text", "number", "currency", "date", "datetime",
  "email", "phone", "select", "radio", "checkbox",
]);
const options = z.array(z.string().trim().min(1).max(255)).max(200);

/** Load a phase and authorize its pipe. */
async function phaseInOrg(phaseId: string, orgId: string) {
  const phase = (await db.select().from(phases).where(eq(phases.id, phaseId)).limit(1))[0];
  if (!phase) throw new TRPCError({ code: "NOT_FOUND", message: "Fase não encontrada" });
  await assertPipeInOrg(phase.pipeId, orgId);
  return phase;
}

/** Load a field and authorize its pipe. */
async function fieldInOrg(fieldId: string, orgId: string) {
  const field = (await db.select().from(fields).where(eq(fields.id, fieldId)).limit(1))[0];
  if (!field) throw new TRPCError({ code: "NOT_FOUND", message: "Campo não encontrado" });
  await assertPipeInOrg(field.pipeId, orgId);
  return field;
}

/** Select/radio need at least one option. */
function checkOptions(type: string, opts: string[] | null | undefined) {
  if ((type === "select" || type === "radio") && !opts?.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Informe ao menos uma opção para a lista." });
  }
}

export const fieldRouter = router({
  listByPipe: protectedProcedure.input(z.object({ pipeId: z.string() })).query(async ({ ctx, input }) => {
    await assertPipeInOrg(input.pipeId, ctx.orgId);
    return db.select().from(fields).where(eq(fields.pipeId, input.pipeId)).orderBy(asc(fields.position));
  }),
  // Takes only phaseId; resolves the owning pipe to authorize.
  listByPhase: protectedProcedure.input(z.object({ phaseId: z.string() })).query(async ({ ctx, input }) => {
    const phase = (await db.select({ pipeId: phases.pipeId }).from(phases).where(eq(phases.id, input.phaseId)).limit(1))[0];
    if (!phase) return [];
    await assertPipeInOrg(phase.pipeId, ctx.orgId);
    return db.select().from(fields).where(eq(fields.phaseId, input.phaseId)).orderBy(asc(fields.position));
  }),

  create: protectedProcedure
    .input(z.object({
      phaseId: z.string(),
      label: z.string().trim().min(1).max(255),
      type: fieldType,
      required: z.boolean().default(false),
      options: options.optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const phase = await phaseInOrg(input.phaseId, ctx.orgId);
      checkOptions(input.type, input.options);
      const [{ max }] = await db.select({ max: sql<number | null>`MAX(${fields.position})` })
        .from(fields).where(eq(fields.phaseId, phase.id));
      const id = crypto.randomUUID();
      await db.insert(fields).values({
        id, pipeId: phase.pipeId, phaseId: phase.id, label: input.label, type: input.type,
        required: input.required, options: input.options ?? null, position: (max ?? -1) + 1,
      });
      return (await db.select().from(fields).where(eq(fields.id, id)).limit(1))[0];
    }),

  update: protectedProcedure
    .input(z.object({
      fieldId: z.string(),
      label: z.string().trim().min(1).max(255).optional(),
      type: fieldType.optional(),
      required: z.boolean().optional(),
      options: options.nullable().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const field = await fieldInOrg(input.fieldId, ctx.orgId);
      const { fieldId, ...patch } = input;
      checkOptions(patch.type ?? field.type, patch.options === undefined ? (field.options as string[] | null) : patch.options);
      if (Object.keys(patch).length) await db.update(fields).set(patch).where(eq(fields.id, fieldId));
      return (await db.select().from(fields).where(eq(fields.id, fieldId)).limit(1))[0];
    }),

  /** Persist a new order of a phase's fields. `fieldIds` must be exactly the phase's fields. */
  reorder: protectedProcedure
    .input(z.object({ phaseId: z.string(), fieldIds: z.array(z.string()).min(1) }))
    .mutation(async ({ ctx, input }) => {
      const phase = await phaseInOrg(input.phaseId, ctx.orgId);
      const rows = await db.select({ id: fields.id }).from(fields).where(eq(fields.phaseId, phase.id));
      const known = new Set(rows.map((r) => r.id));
      if (rows.length !== input.fieldIds.length || !input.fieldIds.every((id) => known.has(id))) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Lista de campos desatualizada. Recarregue." });
      }
      await db.transaction(async (tx) => {
        for (let i = 0; i < input.fieldIds.length; i++) {
          await tx.update(fields).set({ position: i }).where(eq(fields.id, input.fieldIds[i]));
        }
      });
      return { ok: true };
    }),

  /** Delete a field and every card's value for it. */
  remove: protectedProcedure.input(z.object({ fieldId: z.string() })).mutation(async ({ ctx, input }) => {
    const field = await fieldInOrg(input.fieldId, ctx.orgId);
    await db.transaction(async (tx) => {
      await tx.delete(cardFields).where(eq(cardFields.fieldId, field.id));
      await tx.delete(fields).where(eq(fields.id, field.id));
    });
    return { ok: true };
  }),
});
