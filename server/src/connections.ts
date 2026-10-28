import { z } from "zod";
import { and, eq, inArray, isNull, like, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "./db/client.js";
import { cardFields, cards, dataTables, fields, phases, pipes, tableFields, tableRecordFields, tableRecords } from "./db/schema.js";

/** "Conexão" field settings (stored in fields.settings). The target never changes
 *  after creation (existing values point into it); the switches can. */
export const connectionSettings = z.object({
  target: z.enum(["table", "pipe"]),
  targetId: z.string(),
  canSearch: z.boolean().default(true), // connect existing records/cards
  canCreate: z.boolean().default(true), // create a new one from the card
  multiple: z.boolean().default(false), // more than one item
  // Autopreenchimento: copy source column/field → this pipe's field when an item is
  // connected (a copy, decision 2026-10-28: the card keeps its values; "atualizar" re-copies).
  fieldMap: z.array(z.object({ from: z.string(), to: z.string() })).max(50).default([]),
});
export type ConnectionSettings = z.infer<typeof connectionSettings>;

// Text fields accept any source (shown as text); other types need the same type.
const TEXT_TYPES = new Set(["short_text", "long_text"]);
const asText = (v: unknown) => (Array.isArray(v) ? v.join(", ") : typeof v === "boolean" ? (v ? "Sim" : "Não") : String(v));

/** Each mapping: source belongs to the target, destination to this pipe, types compatible. */
export async function checkFieldMap(s: ConnectionSettings, pipeId: string, selfFieldId?: string) {
  if (!s.fieldMap.length) return;
  const sources = s.target === "table"
    ? await db.select({ id: tableFields.id, type: tableFields.type }).from(tableFields).where(eq(tableFields.tableId, s.targetId))
    : await db.select({ id: fields.id, type: fields.type }).from(fields).where(eq(fields.pipeId, s.targetId));
  const dests = await db.select({ id: fields.id, type: fields.type }).from(fields).where(eq(fields.pipeId, pipeId));
  for (const m of s.fieldMap) {
    const src = sources.find((x) => x.id === m.from);
    const dst = dests.find((x) => x.id === m.to);
    if (!src || !dst || dst.id === selfFieldId || ["connection", "attachment", "id"].includes(dst.type)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Mapeamento de preenchimento inválido." });
    }
    if (src.type !== dst.type && !TEXT_TYPES.has(dst.type)) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "No preenchimento, os campos precisam ser do mesmo tipo (ou o destino ser texto)." });
    }
  }
}

/** Values to copy from a connected item into the card (destination field id → value). */
export async function autofillValues(s: ConnectionSettings, itemId: string): Promise<Map<string, unknown>> {
  const out = new Map<string, unknown>();
  if (!s.fieldMap.length) return out;
  const froms = s.fieldMap.map((m) => m.from);
  const rows = s.target === "table"
    ? await db.select({ fieldId: tableRecordFields.fieldId, value: tableRecordFields.value }).from(tableRecordFields)
        .where(and(eq(tableRecordFields.recordId, itemId), inArray(tableRecordFields.fieldId, froms)))
    : await db.select({ fieldId: cardFields.fieldId, value: cardFields.value }).from(cardFields)
        .where(and(eq(cardFields.cardId, itemId), inArray(cardFields.fieldId, froms)));
  const dests = await db.select({ id: fields.id, type: fields.type }).from(fields).where(inArray(fields.id, s.fieldMap.map((m) => m.to)));
  const srcTypes = s.target === "table"
    ? await db.select({ id: tableFields.id, type: tableFields.type }).from(tableFields).where(inArray(tableFields.id, froms))
    : await db.select({ id: fields.id, type: fields.type }).from(fields).where(inArray(fields.id, froms));
  for (const m of s.fieldMap) {
    const v = rows.find((r) => r.fieldId === m.from)?.value;
    if (v === undefined || v === null || v === "") continue;
    const dt = dests.find((d) => d.id === m.to)?.type;
    const st = srcTypes.find((x) => x.id === m.from)?.type;
    out.set(m.to, dt && TEXT_TYPES.has(dt) && st !== dt ? asText(v) : v);
  }
  return out;
}

export function readSettings(raw: unknown): ConnectionSettings | null {
  const r = connectionSettings.safeParse(raw);
  return r.success ? r.data : null;
}

/** The target exists in the org; at least one way to connect. */
export async function checkTarget(s: ConnectionSettings, orgId: string) {
  if (!s.canSearch && !s.canCreate) throw new TRPCError({ code: "BAD_REQUEST", message: "Permita buscar, criar ou os dois." });
  const ok = s.target === "table"
    ? (await db.select({ id: dataTables.id }).from(dataTables).where(and(eq(dataTables.id, s.targetId), eq(dataTables.orgId, orgId), isNull(dataTables.deletedAt))).limit(1))[0]
    : (await db.select({ id: pipes.id }).from(pipes).where(and(eq(pipes.id, s.targetId), eq(pipes.orgId, orgId), isNull(pipes.deletedAt))).limit(1))[0];
  if (!ok) throw new TRPCError({ code: "BAD_REQUEST", message: "Database ou pipe de destino não encontrado." });
}

/** Value = list of record ids (table) or card ids (pipe), all inside the target. */
export async function validateConnection(field: { label: string; settings: unknown }, value: unknown) {
  const s = readSettings(field.settings);
  const bad = (why: string) => new TRPCError({ code: "BAD_REQUEST", message: `"${field.label}": ${why}` });
  if (!s) throw bad("conexão sem configuração");
  if (!Array.isArray(value) || value.some((x) => typeof x !== "string")) throw bad("valor inválido");
  const ids = [...new Set(value as string[])];
  if (!s.multiple && ids.length > 1) throw bad("aceita só um item");
  if (!ids.length) return;
  const found = s.target === "table"
    ? await db.select({ id: tableRecords.id }).from(tableRecords).where(and(eq(tableRecords.tableId, s.targetId), inArray(tableRecords.id, ids)))
    : await db.select({ id: cards.id }).from(cards).where(and(eq(cards.pipeId, s.targetId), isNull(cards.deletedAt), inArray(cards.id, ids)));
  if (found.length !== ids.length) throw bad("item conectado não encontrado");
}

export interface ConnectedItem {
  id: string;
  title: string;
  /** Short "Label: value" lines (database summary columns, or the card's phase). */
  details: string[];
  number?: number; // cards
}

const show = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v === null || v === undefined ? "" : typeof v === "boolean" ? (v ? "Sim" : "Não") : String(v));

/** Display data for connected ids, in the order given. */
export async function describe(s: ConnectionSettings, ids: string[]): Promise<ConnectedItem[]> {
  if (!ids.length) return [];
  if (s.target === "table") {
    const table = (await db.select().from(dataTables).where(eq(dataTables.id, s.targetId)).limit(1))[0];
    const summary = Array.isArray(table?.summaryFieldIds) ? (table!.summaryFieldIds as string[]) : [];
    const recs = await db.select().from(tableRecords).where(and(eq(tableRecords.tableId, s.targetId), inArray(tableRecords.id, ids)));
    const cols = summary.length ? await db.select().from(tableFields).where(inArray(tableFields.id, summary)) : [];
    const vals = summary.length ? await db.select().from(tableRecordFields).where(and(inArray(tableRecordFields.recordId, ids), inArray(tableRecordFields.fieldId, summary))) : [];
    return ids.map((id) => recs.find((r) => r.id === id)).filter((r) => !!r).map((r) => ({
      id: r.id,
      title: r.title,
      details: summary.map((fid) => {
        const col = cols.find((c) => c.id === fid);
        const v = show(vals.find((x) => x.recordId === r.id && x.fieldId === fid)?.value);
        return col && v ? `${col.label}: ${v}` : "";
      }).filter(Boolean),
    }));
  }
  const rows = await db.select({ id: cards.id, number: cards.number, title: cards.title, phase: phases.name, done: cards.done })
    .from(cards).innerJoin(phases, eq(phases.id, cards.currentPhaseId))
    .where(and(eq(cards.pipeId, s.targetId), isNull(cards.deletedAt), inArray(cards.id, ids)));
  return ids.map((id) => rows.find((r) => r.id === id)).filter((r) => !!r)
    .map((r) => ({ id: r.id, number: r.number, title: r.title, details: [`Fase: ${r.phase}${r.done ? " (concluído)" : ""}`] }));
}

/** Search the target by title (or #number for cards). */
export async function search(s: ConnectionSettings, q: string): Promise<ConnectedItem[]> {
  const term = q.trim();
  if (s.target === "table") {
    const where = term ? and(eq(tableRecords.tableId, s.targetId), like(tableRecords.title, `%${term}%`)) : eq(tableRecords.tableId, s.targetId);
    const ids = (await db.select({ id: tableRecords.id }).from(tableRecords).where(where).orderBy(desc(tableRecords.createdAt)).limit(20)).map((r) => r.id);
    return describe(s, ids);
  }
  const num = /^#?\d+$/.test(term) ? Number(term.replace("#", "")) : null;
  const base = and(eq(cards.pipeId, s.targetId), isNull(cards.deletedAt));
  const where = num !== null ? and(base, eq(cards.number, num)) : term ? and(base, like(cards.title, `%${term}%`)) : base;
  const ids = (await db.select({ id: cards.id }).from(cards).where(where).orderBy(desc(cards.createdAt)).limit(20)).map((r) => r.id);
  return describe(s, ids);
}
