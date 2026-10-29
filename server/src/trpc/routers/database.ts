import { z } from "zod";
import { eq, and, asc, desc, inArray, isNull, isNotNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../../db/client.js";
import { dataTables, tableFields, tableRecords, tableRecordFields } from "../../db/schema.js";
import { router, protectedProcedure, adminProcedure } from "../trpc.js";
import { isEmpty, validateShape, uniqueKey } from "../../fieldRules.js";
import { linkedFrom } from "../../connections.js";

/** Databases ("tabelas"): org-wide registries (suppliers, clients, cost centres) that
 *  cards connect to. Admins configure tables and columns; members manage records. */

const columnType = z.enum([
  "short_text", "long_text", "number", "currency", "date", "datetime", "time",
  "email", "phone", "document", "select", "radio", "checklist", "checkbox", "assignee_select",
]);
const UNIQUE_TYPES = new Set(["short_text", "email", "phone", "document", "number", "currency", "date", "datetime"]);
const TITLE_TYPES = new Set(["short_text", "long_text", "email", "phone", "document", "number", "select", "radio", "date"]);
const color = z.enum(["gray", "red", "orange", "amber", "green", "teal", "blue", "purple", "pink"]);
const options = z.array(z.string().trim().min(1).max(255)).max(200);
const valueSchema = z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.string().max(255)).max(200)]);
const columnProps = {
  required: z.boolean().optional(),
  description: z.string().max(2000).nullable().optional(),
  help: z.string().max(500).nullable().optional(),
  isUnique: z.boolean().optional(),
  validationRegex: z.string().max(500).nullable().optional(),
  options: options.nullable().optional(),
};

async function tableInOrg(tableId: string, orgId: string) {
  const t = (await db.select().from(dataTables).where(eq(dataTables.id, tableId)).limit(1))[0];
  if (!t || t.orgId !== orgId || t.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Database não encontrado" });
  return t;
}
async function columnInOrg(fieldId: string, orgId: string) {
  const f = (await db.select().from(tableFields).where(eq(tableFields.id, fieldId)).limit(1))[0];
  if (!f) throw new TRPCError({ code: "NOT_FOUND", message: "Coluna não encontrada" });
  const table = await tableInOrg(f.tableId, orgId);
  return { field: f, table };
}
async function recordInOrg(recordId: string, orgId: string) {
  const r = (await db.select().from(tableRecords).where(eq(tableRecords.id, recordId)).limit(1))[0];
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Registro não encontrado" });
  const table = await tableInOrg(r.tableId, orgId);
  return { record: r, table };
}

function checkColumn(type: string, p: { options?: string[] | null; isUnique?: boolean; validationRegex?: string | null }) {
  if (["select", "radio", "checklist"].includes(type) && p.options !== undefined && !p.options?.length) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Informe ao menos uma opção para a lista." });
  }
  if (p.isUnique && !UNIQUE_TYPES.has(type)) throw new TRPCError({ code: "BAD_REQUEST", message: "Este tipo de coluna não aceita valor único." });
  if (p.validationRegex) {
    if (type !== "short_text") throw new TRPCError({ code: "BAD_REQUEST", message: "Validação por expressão só vale para texto curto." });
    try { new RegExp(p.validationRegex); } catch { throw new TRPCError({ code: "BAD_REQUEST", message: "Expressão de validação inválida." }); }
  }
}

/** Shape + "valor único" (within the table) for one column value. */
export async function validateRecordValue(field: typeof tableFields.$inferSelect, value: unknown, orgId: string, exceptRecordId?: string) {
  if (isEmpty(value)) return;
  await validateShape(field, value, orgId);
  if (field.isUnique) {
    const others = await db.select({ recordId: tableRecordFields.recordId, value: tableRecordFields.value })
      .from(tableRecordFields).where(eq(tableRecordFields.fieldId, field.id));
    const key = uniqueKey(field.type, value);
    if (others.some((o) => o.recordId !== exceptRecordId && !isEmpty(o.value) && uniqueKey(field.type, o.value) === key)) {
      throw new TRPCError({ code: "CONFLICT", message: `Já existe um registro com este valor em "${field.label}".` });
    }
  }
}

export const recordTitleOf = (v: unknown) => (isEmpty(v) ? null : (Array.isArray(v) ? v.join(", ") : String(v)).slice(0, 512));

/** Records with their values, newest first. */
async function recordsWithValues(where: ReturnType<typeof eq>) {
  const rows = await db.select().from(tableRecords).where(where).orderBy(desc(tableRecords.createdAt));
  const ids = rows.map((r) => r.id);
  const vals = ids.length ? await db.select().from(tableRecordFields).where(inArray(tableRecordFields.recordId, ids)) : [];
  return rows.map((r) => ({ ...r, values: vals.filter((v) => v.recordId === r.id).map((v) => ({ fieldId: v.fieldId, value: v.value })) }));
}

export const databaseRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    db.select().from(dataTables).where(and(eq(dataTables.orgId, ctx.orgId), isNull(dataTables.deletedAt))).orderBy(asc(dataTables.name))
  ),

  get: protectedProcedure.input(z.object({ tableId: z.string() })).query(({ ctx, input }) => tableInOrg(input.tableId, ctx.orgId)),

  /** New table starts with a required "Nome" column that names the records. */
  create: adminProcedure.input(z.object({ name: z.string().trim().min(1).max(255) })).mutation(async ({ ctx, input }) => {
    const id = crypto.randomUUID();
    const nameField = crypto.randomUUID();
    await db.transaction(async (tx) => {
      await tx.insert(dataTables).values({ id, orgId: ctx.orgId, name: input.name, titleFieldId: nameField });
      await tx.insert(tableFields).values({ id: nameField, tableId: id, label: "Nome", type: "short_text", required: true, position: 0 });
    });
    return (await db.select().from(dataTables).where(eq(dataTables.id, id)).limit(1))[0];
  }),

  update: adminProcedure
    .input(z.object({
      tableId: z.string(),
      name: z.string().trim().min(1).max(255).optional(),
      description: z.string().max(2000).nullable().optional(),
      icon: z.string().max(16).nullable().optional(),
      color: color.nullable().optional(),
      titleFieldId: z.string().optional(),
      summaryFieldIds: z.array(z.string()).max(5).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const t = await tableInOrg(input.tableId, ctx.orgId);
      const { tableId, ...patch } = input;
      const cols = await db.select().from(tableFields).where(eq(tableFields.tableId, t.id));
      if (patch.titleFieldId) {
        const f = cols.find((c) => c.id === patch.titleFieldId);
        if (!f || !TITLE_TYPES.has(f.type) || f.archivedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Escolha uma coluna de texto para o título." });
      }
      if (patch.summaryFieldIds?.some((id) => !cols.some((c) => c.id === id))) throw new TRPCError({ code: "BAD_REQUEST", message: "Coluna inválida" });
      if (Object.keys(patch).length) await db.update(dataTables).set(patch).where(eq(dataTables.id, t.id));
      // Changing the title column renames every record.
      if (patch.titleFieldId && patch.titleFieldId !== t.titleFieldId) {
        const vals = await db.select().from(tableRecordFields).where(eq(tableRecordFields.fieldId, patch.titleFieldId));
        const recs = await db.select({ id: tableRecords.id }).from(tableRecords).where(eq(tableRecords.tableId, t.id));
        for (const r of recs) {
          const v = vals.find((x) => x.recordId === r.id)?.value;
          await db.update(tableRecords).set({ title: recordTitleOf(v) ?? "(sem nome)" }).where(eq(tableRecords.id, r.id));
        }
      }
      return (await db.select().from(dataTables).where(eq(dataTables.id, t.id)).limit(1))[0];
    }),

  /** Excluir = hide (restorable by an admin). */
  remove: adminProcedure.input(z.object({ tableId: z.string() })).mutation(async ({ ctx, input }) => {
    const t = await tableInOrg(input.tableId, ctx.orgId);
    await db.update(dataTables).set({ deletedAt: new Date() }).where(eq(dataTables.id, t.id));
    return { ok: true };
  }),
  listDeleted: adminProcedure.query(({ ctx }) =>
    db.select().from(dataTables).where(and(eq(dataTables.orgId, ctx.orgId), isNotNull(dataTables.deletedAt))).orderBy(desc(dataTables.deletedAt))
  ),
  restore: adminProcedure.input(z.object({ tableId: z.string() })).mutation(async ({ ctx, input }) => {
    await db.update(dataTables).set({ deletedAt: null }).where(and(eq(dataTables.id, input.tableId), eq(dataTables.orgId, ctx.orgId)));
    return { ok: true };
  }),

  // --- Columns -------------------------------------------------------------
  columns: protectedProcedure.input(z.object({ tableId: z.string(), includeArchived: z.boolean().optional() })).query(async ({ ctx, input }) => {
    await tableInOrg(input.tableId, ctx.orgId);
    const where = input.includeArchived ? eq(tableFields.tableId, input.tableId) : and(eq(tableFields.tableId, input.tableId), isNull(tableFields.archivedAt));
    return db.select().from(tableFields).where(where).orderBy(asc(tableFields.position));
  }),

  createColumn: adminProcedure
    .input(z.object({ tableId: z.string(), label: z.string().trim().min(1).max(255), type: columnType, ...columnProps }))
    .mutation(async ({ ctx, input }) => {
      await tableInOrg(input.tableId, ctx.orgId);
      checkColumn(input.type, { ...input, options: input.options ?? (["select", "radio", "checklist"].includes(input.type) ? [] : undefined) });
      const [{ max }] = await db.select({ max: sql<number | null>`MAX(${tableFields.position})` }).from(tableFields).where(eq(tableFields.tableId, input.tableId));
      const id = crypto.randomUUID();
      await db.insert(tableFields).values({
        id, tableId: input.tableId, label: input.label, type: input.type, position: (max ?? -1) + 1,
        required: input.required ?? false, description: input.description || null, help: input.help || null,
        isUnique: input.isUnique ?? false, validationRegex: input.validationRegex || null, options: input.options ?? null,
      });
      return (await db.select().from(tableFields).where(eq(tableFields.id, id)).limit(1))[0];
    }),

  // No `type`: like phase fields, a column's type is fixed after creation.
  updateColumn: adminProcedure
    .input(z.object({ fieldId: z.string(), label: z.string().trim().min(1).max(255).optional(), ...columnProps }))
    .mutation(async ({ ctx, input }) => {
      const { field } = await columnInOrg(input.fieldId, ctx.orgId);
      const { fieldId, ...patch } = input;
      checkColumn(field.type, {
        options: patch.options,
        isUnique: patch.isUnique ?? field.isUnique,
        validationRegex: patch.validationRegex === undefined ? field.validationRegex : patch.validationRegex,
      });
      if (Object.keys(patch).length) await db.update(tableFields).set(patch).where(eq(tableFields.id, fieldId));
      return (await db.select().from(tableFields).where(eq(tableFields.id, fieldId)).limit(1))[0];
    }),

  reorderColumns: adminProcedure.input(z.object({ tableId: z.string(), fieldIds: z.array(z.string()).min(1) })).mutation(async ({ ctx, input }) => {
    await tableInOrg(input.tableId, ctx.orgId);
    const rows = await db.select({ id: tableFields.id }).from(tableFields).where(eq(tableFields.tableId, input.tableId));
    const known = new Set(rows.map((r) => r.id));
    if (rows.length !== input.fieldIds.length || !input.fieldIds.every((id) => known.has(id))) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Lista de colunas desatualizada. Recarregue." });
    }
    await db.transaction(async (tx) => {
      for (let i = 0; i < input.fieldIds.length; i++) await tx.update(tableFields).set({ position: i }).where(eq(tableFields.id, input.fieldIds[i]));
    });
    return { ok: true };
  }),

  archiveColumn: adminProcedure.input(z.object({ fieldId: z.string(), archived: z.boolean() })).mutation(async ({ ctx, input }) => {
    const { field, table } = await columnInOrg(input.fieldId, ctx.orgId);
    if (input.archived && table.titleFieldId === field.id) throw new TRPCError({ code: "BAD_REQUEST", message: "Escolha outra coluna como título antes de arquivar esta." });
    await db.update(tableFields).set({ archivedAt: input.archived ? new Date() : null }).where(eq(tableFields.id, field.id));
    return { ok: true };
  }),

  removeColumn: adminProcedure.input(z.object({ fieldId: z.string() })).mutation(async ({ ctx, input }) => {
    const { field, table } = await columnInOrg(input.fieldId, ctx.orgId);
    if (table.titleFieldId === field.id) throw new TRPCError({ code: "BAD_REQUEST", message: "A coluna de título não pode ser excluída." });
    await db.transaction(async (tx) => {
      await tx.delete(tableRecordFields).where(eq(tableRecordFields.fieldId, field.id));
      await tx.delete(tableFields).where(eq(tableFields.id, field.id));
    });
    return { ok: true };
  }),

  // --- Records -------------------------------------------------------------
  records: protectedProcedure.input(z.object({ tableId: z.string() })).query(async ({ ctx, input }) => {
    await tableInOrg(input.tableId, ctx.orgId);
    return recordsWithValues(eq(tableRecords.tableId, input.tableId));
  }),

  record: protectedProcedure.input(z.object({ recordId: z.string() })).query(async ({ ctx, input }) => {
    const { record } = await recordInOrg(input.recordId, ctx.orgId);
    return (await recordsWithValues(eq(tableRecords.id, record.id)))[0];
  }),

  createRecord: protectedProcedure
    .input(z.object({ tableId: z.string(), values: z.array(z.object({ fieldId: z.string(), value: valueSchema })) }))
    .mutation(async ({ ctx, input }) => {
      const t = await tableInOrg(input.tableId, ctx.orgId);
      const cols = await db.select().from(tableFields).where(and(eq(tableFields.tableId, t.id), isNull(tableFields.archivedAt)));
      const byId = new Map(input.values.map((v) => [v.fieldId, v.value]));
      const missing = cols.filter((c) => c.required && (isEmpty(byId.get(c.id)) || byId.get(c.id) === false)).map((c) => c.label);
      if (missing.length) throw new TRPCError({ code: "BAD_REQUEST", message: `Preencha os campos obrigatórios: ${missing.join(", ")}` });
      for (const v of input.values) {
        const col = cols.find((c) => c.id === v.fieldId);
        if (!col) throw new TRPCError({ code: "BAD_REQUEST", message: "Coluna inválida" });
        await validateRecordValue(col, v.value, ctx.orgId);
      }
      const id = crypto.randomUUID();
      await db.transaction(async (tx) => {
        await tx.insert(tableRecords).values({ id, tableId: t.id, title: recordTitleOf(t.titleFieldId ? byId.get(t.titleFieldId) : null) ?? "(sem nome)", createdBy: ctx.userId });
        for (const v of input.values) {
          if (isEmpty(v.value)) continue;
          await tx.insert(tableRecordFields).values({ id: crypto.randomUUID(), recordId: id, fieldId: v.fieldId, value: v.value });
        }
      });
      return (await recordsWithValues(eq(tableRecords.id, id)))[0];
    }),

  updateRecordValue: protectedProcedure
    .input(z.object({ recordId: z.string(), fieldId: z.string(), value: valueSchema }))
    .mutation(async ({ ctx, input }) => {
      const { record, table } = await recordInOrg(input.recordId, ctx.orgId);
      const col = (await db.select().from(tableFields).where(eq(tableFields.id, input.fieldId)).limit(1))[0];
      if (!col || col.tableId !== table.id || col.archivedAt) throw new TRPCError({ code: "BAD_REQUEST", message: "Coluna inválida" });
      if (col.required && (isEmpty(input.value) || input.value === false)) throw new TRPCError({ code: "BAD_REQUEST", message: `"${col.label}" é obrigatório.` });
      await validateRecordValue(col, input.value, ctx.orgId, record.id);
      const existing = (await db.select().from(tableRecordFields)
        .where(and(eq(tableRecordFields.recordId, record.id), eq(tableRecordFields.fieldId, col.id))).limit(1))[0];
      if (existing) await db.update(tableRecordFields).set({ value: input.value }).where(eq(tableRecordFields.id, existing.id));
      else await db.insert(tableRecordFields).values({ id: crypto.randomUUID(), recordId: record.id, fieldId: col.id, value: input.value });
      if (table.titleFieldId === col.id) await db.update(tableRecords).set({ title: recordTitleOf(input.value) ?? "(sem nome)" }).where(eq(tableRecords.id, record.id));
      return (await recordsWithValues(eq(tableRecords.id, record.id)))[0];
    }),

  /** "Usado em": cards that connect this record. */
  recordUsage: protectedProcedure.input(z.object({ recordId: z.string() })).query(async ({ ctx, input }) => {
    const { record } = await recordInOrg(input.recordId, ctx.orgId);
    return linkedFrom(record.id, ctx.orgId);
  }),

  removeRecord: protectedProcedure.input(z.object({ recordId: z.string() })).mutation(async ({ ctx, input }) => {
    const { record } = await recordInOrg(input.recordId, ctx.orgId);
    await db.transaction(async (tx) => {
      await tx.delete(tableRecordFields).where(eq(tableRecordFields.recordId, record.id));
      await tx.delete(tableRecords).where(eq(tableRecords.id, record.id));
    });
    return { ok: true };
  }),
});
