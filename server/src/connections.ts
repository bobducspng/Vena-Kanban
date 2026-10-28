import { z } from "zod";
import { and, eq, inArray, isNull, like, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "./db/client.js";
import { cards, dataTables, phases, pipes, tableFields, tableRecordFields, tableRecords } from "./db/schema.js";

/** "Conexão" field settings (stored in fields.settings). The target never changes
 *  after creation (existing values point into it); the switches can. */
export const connectionSettings = z.object({
  target: z.enum(["table", "pipe"]),
  targetId: z.string(),
  canSearch: z.boolean().default(true), // connect existing records/cards
  canCreate: z.boolean().default(true), // create a new one from the card
  multiple: z.boolean().default(false), // more than one item
});
export type ConnectionSettings = z.infer<typeof connectionSettings>;

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
