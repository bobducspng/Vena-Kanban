import type { Card, FieldDef, Label, Phase, Pipe, User } from "../data/types";

/**
 * Relatórios (M12): turns a saved definition + the cards the person can see into a
 * table (and a summary when grouped). Pure: no fetching here.
 */

export interface ReportConfig {
  pipeIds: string[];
  columns: string[]; // builtin keys or "f:<fieldId>"
  filters: {
    status: "all" | "open" | "done" | "late";
    phaseNames: string[];
    assigneeId: string | null;
    period: { by: string; range: "all" | "7d" | "30d" | "90d" | "this_month" | "last_month" | "this_year" | "custom"; from: string | null; to: string | null };
  };
  groupBy: string; // none | pipe | phase | assignee | label | month | f:<fieldId>
  measure: { op: "count" | "sum" | "avg" | "min" | "max"; fieldId: string | null };
}

export const EMPTY_REPORT = (pipeIds: string[]): ReportConfig => ({
  pipeIds,
  columns: ["number", "title", "phase", "assignees", "due", "created"],
  filters: { status: "all", phaseNames: [], assigneeId: null, period: { by: "created", range: "all", from: null, to: null } },
  groupBy: "none",
  measure: { op: "count", fieldId: null },
});

export const BUILTIN: { key: string; label: string }[] = [
  { key: "number", label: "#" }, { key: "title", label: "Título" }, { key: "pipe", label: "Pipe" }, { key: "phase", label: "Fase" },
  { key: "assignees", label: "Responsáveis" }, { key: "labels", label: "Etiquetas" }, { key: "due", label: "Vencimento" },
  { key: "created", label: "Criado em" }, { key: "status", label: "Situação" },
];

export interface ReportData {
  pipes: Pipe[]; phases: Phase[]; fields: FieldDef[]; cards: Card[]; users: User[]; labels: Label[];
}
export type CellValue = string | number | null;
export interface ReportResult {
  columns: { key: string; label: string; numeric: boolean }[];
  rows: { card: Card; cells: CellValue[] }[];
  groups: { label: string; count: number; value: number | null }[] | null;
  measureLabel: string;
  totals: (number | null)[]; // per column: sum of numeric columns
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const dmy = (s: string | null | undefined) => { if (!s) return ""; const [y, m, d] = s.slice(0, 10).split("-"); return `${d}/${m}/${y}`; };
const NUMERIC = new Set(["number", "currency"]);
export const isNumericField = (f: FieldDef) => NUMERIC.has(f.type) || (f.type === "formula" && (f.formula?.format === "number" || f.formula?.format === "currency"));

/** [from, to] (inclusive, "YYYY-MM-DD") for the period, or null = no limit. */
export function periodBounds(p: ReportConfig["filters"]["period"], now = new Date()): [string, string] | null {
  const today = ymd(now);
  const back = (days: number) => ymd(new Date(now.getFullYear(), now.getMonth(), now.getDate() - days + 1));
  switch (p.range) {
    case "7d": return [back(7), today];
    case "30d": return [back(30), today];
    case "90d": return [back(90), today];
    case "this_month": return [ymd(new Date(now.getFullYear(), now.getMonth(), 1)), ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0))];
    case "last_month": return [ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1)), ymd(new Date(now.getFullYear(), now.getMonth(), 0))];
    case "this_year": return [`${now.getFullYear()}-01-01`, `${now.getFullYear()}-12-31`];
    case "custom": return [p.from ?? "0000-01-01", p.to ?? "9999-12-31"];
    default: return null;
  }
}

export function runReport(cfg: ReportConfig, data: ReportData): ReportResult {
  const fieldById = new Map(data.fields.map((f) => [f.id, f]));
  const phaseById = new Map(data.phases.map((p) => [p.id, p]));
  const pipeById = new Map(data.pipes.map((p) => [p.id, p]));
  const userName = (id: string) => data.users.find((u) => u.id === id)?.name ?? "?";
  const labelName = (id: string) => data.labels.find((l) => l.id === id)?.name ?? "";
  const raw = (c: Card, fieldId: string) => c.values.find((v) => v.fieldId === fieldId)?.value;
  const late = (c: Card) => !c.done && !!(c.lateAt || c.overdueAt || c.expiredAt);

  const fieldText = (c: Card, f: FieldDef): CellValue => {
    const v = raw(c, f.id);
    if (v === null || v === undefined || v === "") return null;
    if (isNumericField(f) && typeof v === "number") return v;
    if (typeof v === "boolean") return v ? "Sim" : "Não";
    if (Array.isArray(v)) {
      if (f.type === "assignee_select") return v.map(userName).join(", ");
      if (f.type === "label_select") return v.map(labelName).join(", ");
      if (f.type === "connection" || f.type === "attachment") return `${v.length} item(s)`;
      return v.join(", ");
    }
    if (["date", "due_date"].includes(f.type) || (f.type === "formula" && f.formula?.format === "date")) return dmy(String(v));
    if (f.type === "datetime") return `${dmy(String(v))} ${String(v).slice(11, 16)}`;
    return String(v);
  };

  const cell = (c: Card, key: string): CellValue => {
    switch (key) {
      case "number": return c.number;
      case "title": return c.title;
      case "pipe": return pipeById.get(c.pipeId)?.name ?? "";
      case "phase": return phaseById.get(c.currentPhaseId)?.name ?? "";
      case "assignees": return c.assigneeIds.map(userName).join(", ");
      case "labels": return c.labelIds.map(labelName).join(", ");
      case "due": return c.dueDate ? dmy(ymd(new Date(c.dueDate))) : null;
      case "created": return dmy(ymd(new Date(c.createdAt)));
      case "status": return c.done ? "Concluído" : late(c) ? "Atrasado/vencido" : "Em aberto";
      default: {
        const f = fieldById.get(key.slice(2));
        return f ? fieldText(c, f) : null;
      }
    }
  };

  // Filters.
  const bounds = periodBounds(cfg.filters.period);
  const dayOf = (c: Card): string | null => {
    const by = cfg.filters.period.by;
    if (by === "created") return ymd(new Date(c.createdAt));
    if (by === "due") return c.dueDate ? ymd(new Date(c.dueDate)) : null;
    const v = raw(c, by.slice(2));
    return typeof v === "string" && v.length >= 10 ? v.slice(0, 10) : null;
  };
  const cards = data.cards.filter((c) => {
    if (!cfg.pipeIds.includes(c.pipeId)) return false;
    const st = cfg.filters.status;
    if (st === "open" && c.done) return false;
    if (st === "done" && !c.done) return false;
    if (st === "late" && !late(c)) return false;
    if (cfg.filters.phaseNames.length && !cfg.filters.phaseNames.includes(phaseById.get(c.currentPhaseId)?.name ?? "")) return false;
    if (cfg.filters.assigneeId && !c.assigneeIds.includes(cfg.filters.assigneeId)) return false;
    if (bounds) { const d = dayOf(c); if (!d || d < bounds[0] || d > bounds[1]) return false; }
    return true;
  }).sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  const columns = cfg.columns.map((key) => {
    const b = BUILTIN.find((x) => x.key === key);
    if (b) return { key, label: b.label, numeric: key === "number" ? false : false };
    const f = fieldById.get(key.slice(2));
    const pipeName = cfg.pipeIds.length > 1 && f ? ` (${pipeById.get(f.pipeId)?.name ?? ""})` : "";
    return { key, label: f ? `${f.label}${pipeName}` : "(campo removido)", numeric: !!f && isNumericField(f) };
  });
  const rows = cards.map((card) => ({ card, cells: columns.map((col) => cell(card, col.key)) }));
  const totals = columns.map((col, i) => (col.numeric ? rows.reduce((s, r) => s + (typeof r.cells[i] === "number" ? (r.cells[i] as number) : 0), 0) : null));

  // Summary.
  const mf = cfg.measure.fieldId ? fieldById.get(cfg.measure.fieldId) : undefined;
  const measureLabel = cfg.measure.op === "count" || !mf ? "Cards" : `${{ sum: "Soma", avg: "Média", min: "Mínimo", max: "Máximo", count: "" }[cfg.measure.op]} de ${mf.label}`;
  let groups: ReportResult["groups"] = null;
  if (cfg.groupBy !== "none") {
    const keysOf = (c: Card): string[] => {
      switch (cfg.groupBy) {
        case "pipe": return [pipeById.get(c.pipeId)?.name ?? "?"];
        case "phase": return [phaseById.get(c.currentPhaseId)?.name ?? "?"];
        case "assignee": return c.assigneeIds.length ? c.assigneeIds.map(userName) : ["(sem responsável)"];
        case "label": return c.labelIds.length ? c.labelIds.map(labelName) : ["(sem etiqueta)"];
        case "month": { const d = new Date(c.createdAt); return [`${d.getFullYear()}-${pad(d.getMonth() + 1)}`]; }
        default: {
          const f = fieldById.get(cfg.groupBy.slice(2));
          const v = f ? fieldText(c, f) : null;
          return [v === null || v === "" ? "(vazio)" : String(v)];
        }
      }
    };
    const acc = new Map<string, { count: number; nums: number[] }>();
    for (const c of cards) {
      for (const k of keysOf(c)) {
        const g = acc.get(k) ?? { count: 0, nums: [] };
        g.count++;
        const v = mf ? raw(c, mf.id) : undefined;
        if (typeof v === "number") g.nums.push(v);
        acc.set(k, g);
      }
    }
    const value = (g: { count: number; nums: number[] }) => {
      if (cfg.measure.op === "count" || !mf) return g.count;
      if (!g.nums.length) return null;
      switch (cfg.measure.op) {
        case "sum": return g.nums.reduce((s, x) => s + x, 0);
        case "avg": return g.nums.reduce((s, x) => s + x, 0) / g.nums.length;
        case "min": return Math.min(...g.nums);
        default: return Math.max(...g.nums);
      }
    };
    groups = [...acc.entries()].map(([label, g]) => ({ label, count: g.count, value: value(g) }));
    groups.sort((a, b) => (cfg.groupBy === "month" ? a.label.localeCompare(b.label) : (b.value ?? 0) - (a.value ?? 0)));
    if (cfg.groupBy === "month") groups = groups.map((g) => ({ ...g, label: `${g.label.slice(5)}/${g.label.slice(0, 4)}` }));
  }
  return { columns, rows, groups, measureLabel, totals };
}
