import { and, eq, isNull } from "drizzle-orm";
import { db } from "./db/client.js";
import { cards, fields, labels, memberships, phases, pipes, tableFields, tableRecordFields, tableRecords, users } from "./db/schema.js";
import { readSettings } from "./connections.js";
import { isEmpty, uniqueKey, validateValue } from "./fieldRules.js";
import { createCard, missingInPhase, moveCard, setFieldValue } from "./cardService.js";
import { recordTitleOf, validateRecordValue } from "./trpc/routers/database.js";

/**
 * Importar planilha (M12). The browser reads the .xlsx/.csv and sends rows in batches;
 * each column is mapped to a field (or to the card title / phase). Cells are converted
 * the Brazilian way (1.234,56 · 29/10/2026 · Sim/Não · option names · people by e-mail
 * or name · connected items by title or #número) and then go through the same rules as
 * a card or record created by hand. `dryRun` only checks.
 */

export type Cell = string | number | boolean | null;
export const TITLE = "__title", PHASE = "__phase";
export interface RowResult { row: number; ok: boolean; error?: string; number?: number }
export const NOT_IMPORTABLE = new Set(["attachment", "id", "statement"]);

const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const text = (c: Cell) => (c === null ? "" : String(c).trim());
const split = (s: string, seps = /[;\n]+|,(?!\s*\d)/) => s.split(seps).map((x) => x.trim()).filter(Boolean);
const pad = (n: number) => String(n).padStart(2, "0");

/** "1.234,56" · "1234.56" · "R$ 10" → number. */
export function toNumber(c: Cell): number | null {
  if (typeof c === "number") return c;
  let s = text(c).replace(/[^\d.,-]/g, "");
  if (!s) return null;
  if (s.includes(",") && s.includes(".")) s = s.lastIndexOf(",") > s.lastIndexOf(".") ? s.replace(/\./g, "").replace(",", ".") : s.replace(/,/g, "");
  else if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^-?\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Excel serial day (1900 system) → "YYYY-MM-DD[THH:MM]". */
function fromSerial(n: number, withTime: boolean) {
  const d = new Date(Math.round((n - 25569) * 86400_000));
  const day = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  return withTime ? `${day}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}` : day;
}

/** "29/10/2026", "2026-10-29", "29/10/26 14:30", Excel serial → "YYYY-MM-DD" (+ "THH:MM"). */
export function toDate(c: Cell, withTime: boolean): string | null {
  if (typeof c === "number") return c > 20000 && c < 80000 ? fromSerial(c, withTime) : null;
  const s = text(c);
  let m = /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2}))?/.exec(s);
  let y: number, mo: number, d: number, h = 0, mi = 0;
  if (m) { [y, mo, d] = [+m[1], +m[2], +m[3]]; h = +(m[4] ?? 0); mi = +(m[5] ?? 0); }
  else {
    m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4}|\d{2})(?!\d)(?:\s+(\d{1,2}):(\d{2}))?/.exec(s);
    if (!m) return null;
    [d, mo, y] = [+m[1], +m[2], +m[3] < 100 ? 2000 + +m[3] : +m[3]];
    h = +(m[4] ?? 0); mi = +(m[5] ?? 0);
  }
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d || h > 23 || mi > 59) return null;
  const day = `${y}-${pad(mo)}-${pad(d)}`;
  return withTime ? `${day}T${pad(h)}:${pad(mi)}` : day;
}

export function toTime(c: Cell): string | null {
  if (typeof c === "number" && c >= 0 && c < 1) { const m = Math.round(c * 1440); return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`; }
  const m = /^(\d{1,2})[:h](\d{2})/.exec(text(c));
  return m && +m[1] < 24 && +m[2] < 60 ? `${pad(+m[1])}:${m[2]}` : null;
}

export function toBool(c: Cell): boolean | null {
  if (typeof c === "boolean") return c;
  const s = norm(text(c));
  if (["sim", "s", "yes", "y", "true", "verdadeiro", "1", "x", "ok"].includes(s)) return true;
  if (["nao", "n", "no", "false", "falso", "0", "-"].includes(s)) return false;
  return null;
}

type FieldLike = { id: string; label: string; type: string; options: unknown; settings: unknown; pipeId?: string | null };

/** Turns cells into stored values, with what it needs (people, labels, connected items) loaded once. */
export class Converter {
  private people: { id: string; name: string | null; email: string }[] | null = null;
  private lbls = new Map<string, { id: string; name: string }[]>();
  private targets = new Map<string, { id: string; title: string; number?: number }[]>();
  constructor(private orgId: string) {}

  private async loadPeople() {
    this.people ??= await db.select({ id: users.id, name: users.name, email: users.email }).from(memberships)
      .innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.orgId, this.orgId));
    return this.people;
  }

  /** Throws a short reason when the cell cannot become a value of this field. */
  async value(f: FieldLike, c: Cell): Promise<unknown> {
    if (c === null || text(c) === "") return undefined;
    const s = text(c);
    const options = (f.options as string[] | null) ?? [];
    const option = (v: string) => {
      const hit = options.find((o) => norm(o) === norm(v));
      if (!hit) throw new Error(`"${v}" não é uma opção (${options.slice(0, 6).join(", ")}${options.length > 6 ? "…" : ""})`);
      return hit;
    };
    switch (f.type) {
      case "number": case "currency": {
        const n = toNumber(c);
        if (n === null) throw new Error(`"${s}" não é um número`);
        return n;
      }
      case "date": case "due_date": case "datetime": {
        const d = toDate(c, f.type === "datetime");
        if (!d) throw new Error(`"${s}" não é uma data (use dd/mm/aaaa)`);
        return d;
      }
      case "time": {
        const t = toTime(c);
        if (!t) throw new Error(`"${s}" não é uma hora (use hh:mm)`);
        return t;
      }
      case "checkbox": {
        const b = toBool(c);
        if (b === null) throw new Error(`"${s}" não é Sim ou Não`);
        return b;
      }
      case "select": case "radio": return option(s);
      case "checklist": return split(s).map(option);
      case "email": return s.toLowerCase();
      case "assignee_select": {
        const people = await this.loadPeople();
        return split(s).map((v) => {
          const hit = people.find((p) => p.email.toLowerCase() === v.toLowerCase()) ?? people.filter((p) => p.name && norm(p.name) === norm(v)).at(0);
          if (!hit) throw new Error(`"${v}" não é uma pessoa da organização (use o e-mail)`);
          return hit.id;
        });
      }
      case "label_select": {
        const key = f.pipeId ?? "";
        if (!this.lbls.has(key)) this.lbls.set(key, await db.select({ id: labels.id, name: labels.name }).from(labels).where(eq(labels.pipeId, key)));
        return split(s).map((v) => {
          const hit = this.lbls.get(key)!.find((l) => norm(l.name) === norm(v));
          if (!hit) throw new Error(`etiqueta "${v}" não existe neste pipe`);
          return hit.id;
        });
      }
      case "connection": {
        const st = readSettings(f.settings);
        if (!st) throw new Error("conexão sem configuração");
        if (!this.targets.has(f.id)) {
          this.targets.set(f.id, st.target === "table"
            ? await db.select({ id: tableRecords.id, title: tableRecords.title }).from(tableRecords).where(eq(tableRecords.tableId, st.targetId))
            : await db.select({ id: cards.id, title: cards.title, number: cards.number }).from(cards).where(and(eq(cards.pipeId, st.targetId), isNull(cards.deletedAt))));
        }
        const items = this.targets.get(f.id)!;
        return split(s, /[;\n]+/).map((v) => {
          const num = /^#?(\d+)$/.exec(v);
          const hits = num && st.target === "pipe" ? items.filter((i) => i.number === +num[1]) : items.filter((i) => norm(i.title) === norm(v));
          if (!hits.length) throw new Error(`"${v}" não foi encontrado em ${st.target === "table" ? "o banco de dados conectado" : "o pipe conectado"}`);
          if (hits.length > 1) throw new Error(`"${v}" aparece ${hits.length} vezes no ${st.target === "table" ? "banco" : "pipe"} conectado${st.target === "pipe" ? " (use #número)" : ""}`);
          return hits[0].id;
        });
      }
      default: return s; // short/long text, phone, document
    }
  }
}

type Mapping = (string | null)[]; // per column: field id, TITLE, PHASE or null (ignore)

/** Rows of one batch into cards of a pipe. `firstRow` = spreadsheet row number of rows[0]. */
export async function importCards(input: {
  pipeId: string; orgId: string; userId: string; mapping: Mapping; rows: Cell[][]; firstRow: number; dryRun: boolean; runAutomations: boolean;
}): Promise<RowResult[]> {
  const pipe = (await db.select().from(pipes).where(eq(pipes.id, input.pipeId)).limit(1))[0];
  const allFields = await db.select().from(fields).where(and(eq(fields.pipeId, input.pipeId), isNull(fields.archivedAt)));
  const phaseList = await db.select().from(phases).where(eq(phases.pipeId, input.pipeId));
  const start = phaseList.find((p) => p.isStart)!;
  const conv = new Converter(input.orgId);
  const seen = new Map<string, Set<string>>(); // unique fields inside this batch
  const out: RowResult[] = [];

  for (const [i, row] of input.rows.entries()) {
    const rowNo = input.firstRow + i;
    if (row.every((c) => c === null || text(c) === "")) continue; // blank line
    try {
      const values: { field: (typeof allFields)[number]; value: unknown }[] = [];
      let title = "", phase = start;
      for (const [col, target] of input.mapping.entries()) {
        const cell = row[col] ?? null;
        if (!target) continue;
        if (target === TITLE) { title = text(cell).slice(0, 512); continue; }
        if (target === PHASE) {
          if (!text(cell)) continue;
          const p = phaseList.find((x) => norm(x.name) === norm(text(cell)));
          if (!p) throw new Error(`fase "${text(cell)}" não existe (${phaseList.map((x) => x.name).join(", ")})`);
          phase = p;
          continue;
        }
        const f = allFields.find((x) => x.id === target);
        if (!f || NOT_IMPORTABLE.has(f.type)) continue;
        let v: unknown;
        try { v = await conv.value(f, cell); } catch (e) { throw new Error(`${f.label}: ${(e as Error).message}`); }
        if (v === undefined || isEmpty(v)) continue;
        await validateValue(f, v, input.orgId);
        if (f.isUnique) {
          const set = seen.get(f.id) ?? new Set<string>();
          const k = uniqueKey(f.type, v);
          if (set.has(k)) throw new Error(`${f.label}: valor repetido na planilha`);
          set.add(k); seen.set(f.id, set);
        }
        values.push({ field: f, value: v });
      }
      if (!pipe.titleFieldId && !title) throw new Error("título vazio");
      const startValues = values.filter((v) => v.field.phaseId === start.id).map((v) => ({ fieldId: v.field.id, value: v.value }));
      const missing = await missingInPhase(start.id, startValues, ["attachment", "id"]);
      if (missing.length) throw new Error(`falta preencher: ${missing.join(", ")}`);
      if (input.dryRun) { out.push({ row: rowNo, ok: true }); continue; }

      const actor = { userId: input.userId, via: "Importação de planilha", depth: input.runAutomations ? 0 : -1 };
      const cardId = await createCard({ pipeId: input.pipeId, title, values: startValues, orgId: input.orgId, actor });
      try {
        for (const v of values.filter((x) => x.field.phaseId !== start.id)) {
          const card = (await db.select().from(cards).where(eq(cards.id, cardId)).limit(1))[0];
          await setFieldValue({ card, fieldId: v.field.id, value: v.value, orgId: input.orgId, actor, checkEditable: false });
        }
        if (phase.id !== start.id) {
          const card = (await db.select().from(cards).where(eq(cards.id, cardId)).limit(1))[0];
          await moveCard({ card, toPhaseId: phase.id, actor, checkTransition: false });
        }
      } catch (e) {
        // Half-made card: out of the way (trash), and the row is reported.
        await db.update(cards).set({ deletedAt: new Date(), deletedBy: input.userId }).where(eq(cards.id, cardId));
        throw e;
      }
      const number = (await db.select({ number: cards.number }).from(cards).where(eq(cards.id, cardId)).limit(1))[0]?.number;
      out.push({ row: rowNo, ok: true, number });
    } catch (e) {
      out.push({ row: rowNo, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

/** Rows of one batch into records of a banco de dados. */
export async function importRecords(input: {
  tableId: string; titleFieldId: string | null; orgId: string; userId: string; mapping: Mapping; rows: Cell[][]; firstRow: number; dryRun: boolean;
}): Promise<RowResult[]> {
  const cols = await db.select().from(tableFields).where(and(eq(tableFields.tableId, input.tableId), isNull(tableFields.archivedAt)));
  const conv = new Converter(input.orgId);
  const seen = new Map<string, Set<string>>();
  const out: RowResult[] = [];

  for (const [i, row] of input.rows.entries()) {
    const rowNo = input.firstRow + i;
    if (row.every((c) => c === null || text(c) === "")) continue;
    try {
      const values = new Map<string, unknown>();
      for (const [col, target] of input.mapping.entries()) {
        const f = target ? cols.find((x) => x.id === target) : undefined;
        if (!f || NOT_IMPORTABLE.has(f.type)) continue;
        let v: unknown;
        try { v = await conv.value({ ...f, settings: null, pipeId: null }, row[col] ?? null); } catch (e) { throw new Error(`${f.label}: ${(e as Error).message}`); }
        if (v === undefined || isEmpty(v)) continue;
        await validateRecordValue(f, v, input.orgId);
        if (f.isUnique) {
          const set = seen.get(f.id) ?? new Set<string>();
          const k = uniqueKey(f.type, v);
          if (set.has(k)) throw new Error(`${f.label}: valor repetido na planilha`);
          set.add(k); seen.set(f.id, set);
        }
        values.set(f.id, v);
      }
      const missing = cols.filter((c) => c.required && (isEmpty(values.get(c.id)) || values.get(c.id) === false)).map((c) => c.label);
      if (missing.length) throw new Error(`falta preencher: ${missing.join(", ")}`);
      if (input.dryRun) { out.push({ row: rowNo, ok: true }); continue; }
      const id = crypto.randomUUID();
      await db.transaction(async (tx) => {
        await tx.insert(tableRecords).values({ id, tableId: input.tableId, title: recordTitleOf(input.titleFieldId ? values.get(input.titleFieldId) : null) ?? "(sem nome)", createdBy: input.userId });
        for (const [fieldId, value] of values) await tx.insert(tableRecordFields).values({ id: crypto.randomUUID(), recordId: id, fieldId, value });
      });
      out.push({ row: rowNo, ok: true });
    } catch (e) {
      out.push({ row: rowNo, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return out;
}

