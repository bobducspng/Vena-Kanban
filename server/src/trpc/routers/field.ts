import { z } from "zod";
import { eq, asc, and, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../../db/client.js";
import { fields, phases, cardFields } from "../../db/schema.js";
import { router, protectedProcedure, adminProcedure, assertPipeInOrg } from "../trpc.js";
import { connectionSettings, checkTarget, checkFieldMap, readSettings } from "../../connections.js";

// Types the editor offers (and the card form renders).
const fieldType = z.enum([
  "short_text", "long_text", "number", "currency", "date", "datetime", "time", "due_date",
  "email", "phone", "document", "select", "radio", "checklist", "checkbox",
  "assignee_select", "label_select", "attachment", "id", "connection",
]);
const options = z.array(z.string().trim().min(1).max(255)).max(200);
// Types where "valor único" makes sense (as in the original).
const UNIQUE_TYPES = new Set(["short_text", "email", "phone", "document", "number", "currency", "date", "datetime"]);
const props = {
  description: z.string().max(2000).nullable().optional(),
  help: z.string().max(500).nullable().optional(),
  editableOtherPhases: z.boolean().optional(),
  isUnique: z.boolean().optional(),
  validationRegex: z.string().max(500).nullable().optional(),
};

/** Reject a regex that does not compile, and unique on a type that can't be unique. */
function checkProps(type: string, p: { isUnique?: boolean; validationRegex?: string | null }) {
  if (p.isUnique && !UNIQUE_TYPES.has(type)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Este tipo de campo não aceita valor único." });
  }
  if (p.validationRegex) {
    if (type !== "short_text") throw new TRPCError({ code: "BAD_REQUEST", message: "Validação por expressão só vale para texto curto." });
    try { new RegExp(p.validationRegex); } catch {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Expressão de validação inválida." });
    }
  }
}

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

/** Select/radio/checklist need at least one option. */
function checkOptions(type: string, opts: string[] | null | undefined) {
  if ((type === "select" || type === "radio" || type === "checklist") && !opts?.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Informe ao menos uma opção para a lista." });
  }
}

export const fieldRouter = router({
  // Archived fields are left out unless asked for (the settings screen lists them to restore).
  listByPipe: protectedProcedure.input(z.object({ pipeId: z.string(), includeArchived: z.boolean().optional() })).query(async ({ ctx, input }) => {
    await assertPipeInOrg(input.pipeId, ctx.orgId);
    const where = input.includeArchived ? eq(fields.pipeId, input.pipeId) : and(eq(fields.pipeId, input.pipeId), isNull(fields.archivedAt));
    return db.select().from(fields).where(where).orderBy(asc(fields.position));
  }),
  // Takes only phaseId; resolves the owning pipe to authorize.
  listByPhase: protectedProcedure.input(z.object({ phaseId: z.string() })).query(async ({ ctx, input }) => {
    const phase = (await db.select({ pipeId: phases.pipeId }).from(phases).where(eq(phases.id, input.phaseId)).limit(1))[0];
    if (!phase) return [];
    await assertPipeInOrg(phase.pipeId, ctx.orgId);
    return db.select().from(fields).where(and(eq(fields.phaseId, input.phaseId), isNull(fields.archivedAt))).orderBy(asc(fields.position));
  }),

  /** Arquivar: safe alternative to deleting; values are kept. */
  archive: adminProcedure.input(z.object({ fieldId: z.string(), archived: z.boolean() })).mutation(async ({ ctx, input }) => {
    await fieldInOrg(input.fieldId, ctx.orgId);
    await db.update(fields).set({ archivedAt: input.archived ? new Date() : null }).where(eq(fields.id, input.fieldId));
    return { ok: true };
  }),

  create: adminProcedure
    .input(z.object({
      phaseId: z.string(),
      label: z.string().trim().min(1).max(255),
      type: fieldType,
      required: z.boolean().default(false),
      options: options.optional(),
      // "Conexão" only: target (database/pipe) and switches.
      settings: connectionSettings.optional(),
      ...props,
    }))
    .mutation(async ({ ctx, input }) => {
      const phase = await phaseInOrg(input.phaseId, ctx.orgId);
      checkOptions(input.type, input.options);
      checkProps(input.type, input);
      if (input.type === "connection") {
        if (!input.settings) throw new TRPCError({ code: "BAD_REQUEST", message: "Escolha o database ou pipe da conexão." });
        await checkTarget(input.settings, ctx.orgId);
        await checkFieldMap(input.settings, phase.pipeId);
      }
      const [{ max }] = await db.select({ max: sql<number | null>`MAX(${fields.position})` })
        .from(fields).where(eq(fields.phaseId, phase.id));
      const id = crypto.randomUUID();
      await db.insert(fields).values({
        id, pipeId: phase.pipeId, phaseId: phase.id, label: input.label, type: input.type,
        required: input.required, options: input.options ?? null, position: (max ?? -1) + 1,
        description: input.description || null, help: input.help || null,
        editableOtherPhases: input.editableOtherPhases ?? true, isUnique: input.isUnique ?? false,
        validationRegex: input.validationRegex || null,
        settings: input.type === "connection" ? input.settings : null,
      });
      return (await db.select().from(fields).where(eq(fields.id, id)).limit(1))[0];
    }),

  update: adminProcedure
    .input(z.object({
      fieldId: z.string(),
      label: z.string().trim().min(1).max(255).optional(),
      // No `type`: a field's type cannot change after creation.
      required: z.boolean().optional(),
      options: options.nullable().optional(),
      // Connection switches; the target itself is fixed after creation.
      settings: connectionSettings.pick({ canSearch: true, canCreate: true, multiple: true, fieldMap: true, requireChild: true, requireChildrenDone: true }).partial().optional(),
      ...props,
    }))
    .mutation(async ({ ctx, input }) => {
      const field = await fieldInOrg(input.fieldId, ctx.orgId);
      const { fieldId, ...patch } = input;
      checkOptions(field.type, patch.options === undefined ? (field.options as string[] | null) : patch.options);
      checkProps(field.type, {
        isUnique: patch.isUnique ?? field.isUnique,
        validationRegex: patch.validationRegex === undefined ? field.validationRegex : patch.validationRegex,
      });
      const { settings: switches, ...rest } = patch;
      let settings: unknown;
      if (switches && field.type === "connection") {
        const merged = { ...readSettings(field.settings)!, ...switches };
        if (!merged.canSearch && !merged.canCreate) throw new TRPCError({ code: "BAD_REQUEST", message: "Permita buscar, criar ou os dois." });
        await checkFieldMap(merged, field.pipeId, field.id);
        settings = merged;
      }
      const set = settings ? { ...rest, settings } : rest;
      if (Object.keys(set).length) await db.update(fields).set(set).where(eq(fields.id, fieldId));
      return (await db.select().from(fields).where(eq(fields.id, fieldId)).limit(1))[0];
    }),

  /** Persist a new order of a phase's fields. `fieldIds` must be exactly the phase's fields. */
  reorder: adminProcedure
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
  remove: adminProcedure.input(z.object({ fieldId: z.string() })).mutation(async ({ ctx, input }) => {
    const field = await fieldInOrg(input.fieldId, ctx.orgId);
    await db.transaction(async (tx) => {
      await tx.delete(cardFields).where(eq(cardFields.fieldId, field.id));
      await tx.delete(fields).where(eq(fields.id, field.id));
    });
    return { ok: true };
  }),
});
