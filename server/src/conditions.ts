/**
 * Field conditionals ("condicionais de campo"): evaluation shared by the server
 * (required-field gates) and the front-end (show/hide while filling).
 * KEEP IN SYNC with app/src/lib/conditions.ts — same code, both sides (tests: npm run -w server test:conditions).
 *
 * A condition = expression (groups OR'ed, rules inside a group AND'ed)
 * + actions when true + actions when false. Conditions run in order; later ones win.
 * Initial state: a field targeted by any "show" action starts hidden.
 */

export const OPERATORS = [
  "equals", "not_equals", "present", "blank", "string_contains", "string_not_contains",
  "number_greater_than", "number_less_than",
  "date_is_today", "date_is_yesterday", "date_in_current_week", "date_in_last_week",
  "date_in_current_month", "date_in_last_month", "date_in_current_year", "date_in_last_year",
  "date_is", "date_is_after", "date_is_before",
] as const;
export type Operator = (typeof OPERATORS)[number];
export const ACTIONS = ["show", "hide", "require", "optional"] as const;
export type ConditionAction = (typeof ACTIONS)[number];

export interface Rule { fieldId: string; operator: Operator; value?: string | number | null }
export interface FieldAction { fieldId: string; action: ConditionAction }
export interface ConditionDef {
  id: string;
  phaseId: string;
  position: number;
  groups: Rule[][];
  onTrue: FieldAction[];
  onFalse: FieldAction[];
}
export interface FieldState { visible: boolean; required: boolean }
type Value = string | number | boolean | null | string[] | undefined;

/** Operators that need no comparison value. */
export const VALUELESS = new Set<Operator>([
  "present", "blank", "date_is_today", "date_is_yesterday", "date_in_current_week", "date_in_last_week",
  "date_in_current_month", "date_in_last_month", "date_in_current_year", "date_in_last_year",
]);

// Calendar dates in Brasília time, so "hoje" means the same on the VM (UTC) and in the browser.
const TZ = "America/Sao_Paulo";
const ymd = (d: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
const parseDay = (s: string) => { const [y, m, d] = s.split("-").map(Number); return Date.UTC(y, m - 1, d); };
const DAY = 86_400_000;
/** "YYYY-MM-DD" of a value (date field, or datetime-local "YYYY-MM-DDTHH:MM"). */
const dayOf = (v: Value): string | null => (typeof v === "string" && /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null);

const isBlank = (v: Value) => v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
const text = (v: Value) => (Array.isArray(v) ? v.join(" ") : v === undefined || v === null ? "" : String(v)).toLowerCase();

export function evalRule(rule: Rule, v: Value, now = new Date()): boolean {
  const cmp = rule.value === undefined || rule.value === null ? "" : String(rule.value);
  switch (rule.operator) {
    case "present": return !isBlank(v);
    case "blank": return isBlank(v);
    case "equals":
      if (Array.isArray(v)) return v.includes(cmp);
      if (typeof v === "boolean") return String(v) === cmp;
      if (typeof v === "number") return v === Number(cmp);
      return text(v) === cmp.toLowerCase();
    case "not_equals": return !evalRule({ ...rule, operator: "equals" }, v, now);
    case "string_contains": return text(v).includes(cmp.toLowerCase());
    case "string_not_contains": return !text(v).includes(cmp.toLowerCase());
    case "number_greater_than": return !isBlank(v) && Number(v) > Number(cmp);
    case "number_less_than": return !isBlank(v) && Number(v) < Number(cmp);
  }
  // Date operators.
  const day = dayOf(v);
  if (!day) return false;
  const d = parseDay(day);
  const today = parseDay(ymd(now));
  const dow = (new Date(today).getUTCDay() + 6) % 7; // Monday = 0
  const weekStart = today - dow * DAY;
  const t = new Date(today);
  const monthStart = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1);
  const lastMonthStart = Date.UTC(t.getUTCFullYear(), t.getUTCMonth() - 1, 1);
  const yearStart = Date.UTC(t.getUTCFullYear(), 0, 1);
  const lastYearStart = Date.UTC(t.getUTCFullYear() - 1, 0, 1);
  switch (rule.operator) {
    case "date_is_today": return d === today;
    case "date_is_yesterday": return d === today - DAY;
    case "date_in_current_week": return d >= weekStart && d < weekStart + 7 * DAY;
    case "date_in_last_week": return d >= weekStart - 7 * DAY && d < weekStart;
    case "date_in_current_month": return d >= monthStart && d < Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 1);
    case "date_in_last_month": return d >= lastMonthStart && d < monthStart;
    case "date_in_current_year": return d >= yearStart && d < Date.UTC(t.getUTCFullYear() + 1, 0, 1);
    case "date_in_last_year": return d >= lastYearStart && d < yearStart;
    case "date_is": return !!dayOf(cmp) && d === parseDay(cmp);
    case "date_is_after": return !!dayOf(cmp) && d > parseDay(cmp);
    case "date_is_before": return !!dayOf(cmp) && d < parseDay(cmp);
    default: return false;
  }
}

/** True when any group has all its rules true. An empty expression is true. */
export function evalExpression(groups: Rule[][], values: Record<string, Value>, now = new Date()): boolean {
  const nonEmpty = groups.filter((g) => g.length > 0);
  if (nonEmpty.length === 0) return true;
  return nonEmpty.some((g) => g.every((r) => evalRule(r, values[r.fieldId], now)));
}

/** Visible/required state of each field, after running the conditions of its phase in order. */
export function fieldStates(
  fields: { id: string; phaseId: string; required: boolean }[],
  conditions: ConditionDef[],
  values: Record<string, Value>,
  now = new Date()
): Map<string, FieldState> {
  const state = new Map<string, FieldState>(fields.map((f) => [f.id, { visible: true, required: f.required }]));
  // Targets of a "show" start hidden until a condition shows them.
  for (const c of conditions) {
    for (const a of [...c.onTrue, ...c.onFalse]) {
      if (a.action === "show" && state.has(a.fieldId)) state.get(a.fieldId)!.visible = false;
    }
  }
  for (const c of [...conditions].sort((a, b) => a.position - b.position)) {
    for (const a of evalExpression(c.groups, values, now) ? c.onTrue : c.onFalse) {
      const s = state.get(a.fieldId);
      if (!s) continue;
      if (a.action === "show") s.visible = true;
      else if (a.action === "hide") s.visible = false;
      else if (a.action === "require") s.required = true;
      else s.required = false;
    }
  }
  return state;
}

/** Fields that must be filled: required and visible. */
export const mustFill = (s: FieldState | undefined) => !!s && s.visible && s.required;
