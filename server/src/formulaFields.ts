import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "./db/client.js";
import { cardFields, cards, fields, phases } from "./db/schema.js";
import { evaluate, FormulaError, references, type FValue } from "./formula.js";

/**
 * Campo fórmula (M12): a field whose value is computed from other fields of the card
 * ({Valor} * {Quantidade}, {Entrega} - {Pedido}, ROUND(...)), same language as the
 * "Fórmula" automation. Stored like any value, so lists, exports, Power BI and
 * conditionals see it. Recomputed after the card is created and after any change.
 */

export const formulaSettings = z.object({
  expression: z.string().trim().min(1).max(2000),
  format: z.enum(["number", "currency", "date", "text"]),
});
export type FormulaSettings = z.infer<typeof formulaSettings>;
export const readFormula = (s: unknown): FormulaSettings | null => { const r = formulaSettings.safeParse(s); return r.success ? r.data : null; };

const norm = (s: string) => s.trim().toLowerCase();

/** Throws a readable message when the expression is wrong for this pipe. */
export async function checkFormula(pipeId: string, f: FormulaSettings, selfId?: string) {
  const defs = await db.select({ id: fields.id, label: fields.label }).from(fields).where(and(eq(fields.pipeId, pipeId), isNull(fields.archivedAt)));
  for (const name of references(f.expression)) {
    const d = defs.find((x) => norm(x.label) === norm(name));
    if (!d) throw new FormulaError(`o campo "${name}" não existe neste pipe`);
    if (d.id === selfId) throw new FormulaError("a fórmula não pode usar o próprio campo");
  }
  evaluate(f.expression, () => 1); // syntax
}

/** Result shaped for the chosen format (null when it cannot be computed). */
function shape(format: FormulaSettings["format"], v: FValue): unknown {
  if (v === null || v === undefined || (typeof v === "number" && !Number.isFinite(v))) return null;
  switch (format) {
    case "number": case "currency": return typeof v === "number" ? Math.round(v * 1e6) / 1e6 : null;
    case "date": return typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
    default: return typeof v === "boolean" ? (v ? "Sim" : "Não") : typeof v === "number" ? String(Math.round(v * 1e6) / 1e6) : String(v);
  }
}

/** Recompute every formula field of the card; writes only what changed. */
export async function recomputeFormulas(cardId: string) {
  const card = (await db.select({ pipeId: cards.pipeId }).from(cards).where(eq(cards.id, cardId)).limit(1))[0];
  if (!card) return;
  const defs = await db.select().from(fields).where(and(eq(fields.pipeId, card.pipeId), isNull(fields.archivedAt)));
  const formulas = defs.filter((d) => d.type === "formula" && readFormula(d.settings));
  if (!formulas.length) return;
  const order = new Map((await db.select({ id: phases.id, position: phases.position }).from(phases).where(eq(phases.pipeId, card.pipeId))).map((p) => [p.id, p.position]));
  formulas.sort((a, b) => (order.get(a.phaseId) ?? 0) - (order.get(b.phaseId) ?? 0) || a.position - b.position);

  const rows = await db.select().from(cardFields).where(eq(cardFields.cardId, cardId));
  const values = new Map(rows.map((r) => [r.fieldId, r.value]));
  const ref = (name: string): FValue => {
    const f = defs.find((d) => norm(d.label) === norm(name));
    if (!f) throw new FormulaError(`campo "${name}" não existe`);
    const v = values.get(f.id);
    if (v === undefined || v === null || v === "") return null;
    if (Array.isArray(v)) return v.length;
    if (typeof v === "string" && ["date", "due_date", "datetime"].includes(f.type)) return v.slice(0, 10);
    return v as FValue;
  };

  // Two passes: a formula may use another formula that comes after it.
  for (let pass = 0; pass < 2; pass++) {
    for (const f of formulas) {
      const s = readFormula(f.settings)!;
      let result: unknown = null;
      try { result = shape(s.format, evaluate(s.expression, ref)); } catch { result = null; }
      if (JSON.stringify(result ?? null) === JSON.stringify(values.get(f.id) ?? null)) continue;
      values.set(f.id, result);
      const existing = rows.find((r) => r.fieldId === f.id);
      if (existing) await db.update(cardFields).set({ value: result, filledAt: result === null ? null : new Date() }).where(eq(cardFields.id, existing.id));
      else {
        const id = crypto.randomUUID();
        await db.insert(cardFields).values({ id, cardId, fieldId: f.id, value: result, filledAt: result === null ? null : new Date() });
        rows.push({ id, cardId, fieldId: f.id, value: result, filledAt: null } as (typeof rows)[number]);
      }
    }
  }
}

/** After a formula field is created or edited: every card of the pipe. */
export async function recomputePipe(pipeId: string) {
  const list = await db.select({ id: cards.id }).from(cards).where(and(eq(cards.pipeId, pipeId), isNull(cards.deletedAt)));
  for (const c of list) await recomputeFormulas(c.id);
}
