/**
 * Formula language for the "Fórmula" automation action. A tiny, safe interpreter
 * (no eval): numbers, dates, + - * / % ^, parentheses, comparisons and a fixed set
 * of functions. Field values come in as {Field name} references, resolved by the caller.
 *
 *   {Valor} * 1.1              ROUND({Total} / 3, 2)         MAX({A}, {B}, 0)
 *   {Entrega} - {Pedido}  → days between dates             {Pedido} + 30 → a date
 *   IF_NULL({Desconto}, 0)     {Valor} > 1000 → true/false
 *
 * Dates are "YYYY-MM-DD" strings: date ± number = date; date − date = days.
 */

export type FValue = number | string | boolean | null; // string = date "YYYY-MM-DD"
type Tok = { t: "num"; v: number } | { t: "ref"; v: string } | { t: "id"; v: string } | { t: "op"; v: string };

export class FormulaError extends Error {}

const DATE = /^\d{4}-\d{2}-\d{2}/;
const DAY = 86_400_000;
const toDay = (s: string) => { const [y, m, d] = s.slice(0, 10).split("-").map(Number); return Date.UTC(y, m - 1, d); };
const fromDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const isDate = (v: FValue): v is string => typeof v === "string" && DATE.test(v);

function tokenize(src: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (/\s/.test(c)) { i++; continue; }
    if (c === "{") {
      const j = src.indexOf("}", i);
      if (j < 0) throw new FormulaError("Falta fechar uma referência com }");
      out.push({ t: "ref", v: src.slice(i + 1, j).trim() }); i = j + 1; continue;
    }
    // Decimal point only: "," separates function arguments (MAX(1,5) = 5).
    const num = /^\d+(?:\.\d+)?/.exec(src.slice(i));
    if (num) { out.push({ t: "num", v: Number(num[0]) }); i += num[0].length; continue; }
    const id = /^[A-Za-z_][A-Za-z_0-9]*/.exec(src.slice(i));
    if (id) { out.push({ t: "id", v: id[0].toUpperCase() }); i += id[0].length; continue; }
    const op = /^(<=|>=|<>|[-+*/%^()<>=;,])/.exec(src.slice(i));
    if (op) { out.push({ t: "op", v: op[0] === ";" ? "," : op[0] }); i += op[0].length; continue; }
    throw new FormulaError(`Caractere inesperado: "${c}"`);
  }
  return out;
}

const FUNCS = new Set(["SUM", "AVERAGE", "MIN", "MAX", "MULTIPLY", "DIVIDE", "SUBTRACT", "COUNT", "ROUND", "IF_NULL", "ABS", "TODAY"]);

/** Evaluate `src`; `ref(name)` returns the value of the field called `name`. */
export function evaluate(src: string, ref: (name: string) => FValue): FValue {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const isOp = (v: string) => peek()?.t === "op" && peek()!.v === v;
  const eat = (v: string) => { if (!isOp(v)) throw new FormulaError(`Esperava "${v}"`); p++; };
  const num = (v: FValue, what: string) => {
    if (v === null) throw new FormulaError(`${what}: valor vazio (use IF_NULL)`);
    if (typeof v === "number") return v;
    if (typeof v === "boolean") return v ? 1 : 0;
    const n = Number(String(v).replace(",", "."));
    if (Number.isNaN(n)) throw new FormulaError(`${what}: "${v}" não é número`);
    return n;
  };

  // comparison > additive > multiplicative > power > unary > primary
  function comparison(): FValue {
    const left = additive();
    const op = peek();
    if (op?.t === "op" && ["<", ">", "<=", ">=", "=", "<>"].includes(op.v)) {
      p++;
      const right = additive();
      const a = isDate(left) ? toDay(left) : num(left, "comparação");
      const b = isDate(right) ? toDay(right) : num(right, "comparação");
      return op.v === "<" ? a < b : op.v === ">" ? a > b : op.v === "<=" ? a <= b : op.v === ">=" ? a >= b : op.v === "=" ? a === b : a !== b;
    }
    return left;
  }
  function additive(): FValue {
    let v = multiplicative();
    while (isOp("+") || isOp("-")) {
      const op = toks[p++] as { v: string };
      const r = multiplicative();
      if (isDate(v) && isDate(r) && op.v === "-") v = Math.round((toDay(v) - toDay(r)) / DAY);
      else if (isDate(v)) v = fromDay(toDay(v) + (op.v === "+" ? 1 : -1) * Math.round(num(r, "dias")) * DAY);
      else if (isDate(r) && op.v === "+") v = fromDay(toDay(r) + Math.round(num(v, "dias")) * DAY);
      else v = op.v === "+" ? num(v, "soma") + num(r, "soma") : num(v, "subtração") - num(r, "subtração");
    }
    return v;
  }
  function multiplicative(): FValue {
    let v = power();
    while (isOp("*") || isOp("/") || isOp("%")) {
      const op = toks[p++] as { v: string };
      const a = num(v, "conta"), b = num(power(), "conta");
      if ((op.v === "/" || op.v === "%") && b === 0) throw new FormulaError("Divisão por zero");
      v = op.v === "*" ? a * b : op.v === "/" ? a / b : a % b;
    }
    return v;
  }
  function power(): FValue {
    const base = unary();
    if (isOp("^")) { p++; return Math.pow(num(base, "potência"), num(power(), "potência")); }
    return base;
  }
  function unary(): FValue {
    if (isOp("-")) { p++; return -num(unary(), "sinal"); }
    if (isOp("+")) { p++; return num(unary(), "sinal"); }
    return primary();
  }
  function primary(): FValue {
    const tok = peek();
    if (!tok) throw new FormulaError("Fórmula incompleta");
    if (tok.t === "num") { p++; return tok.v; }
    if (tok.t === "ref") { p++; return ref(tok.v); }
    if (tok.t === "op" && tok.v === "(") { p++; const v = comparison(); eat(")"); return v; }
    if (tok.t === "id") {
      p++;
      if (tok.v === "TRUE" || tok.v === "FALSE") return tok.v === "TRUE";
      if (!FUNCS.has(tok.v)) throw new FormulaError(`Função desconhecida: ${tok.v}`);
      eat("(");
      const args: FValue[] = [];
      if (!isOp(")")) { do { args.push(comparison()); } while (isOp(",") && ++p); }
      eat(")");
      return call(tok.v, args);
    }
    throw new FormulaError(`Inesperado: "${tok.v}"`);
  }
  function call(fn: string, args: FValue[]): FValue {
    const nums = () => args.filter((a) => a !== null).map((a) => num(a, fn));
    switch (fn) {
      case "TODAY": return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
      case "SUM": return nums().reduce((s, x) => s + x, 0);
      case "MULTIPLY": return nums().reduce((s, x) => s * x, 1);
      case "SUBTRACT": { const [a, ...r] = nums(); return r.reduce((s, x) => s - x, a ?? 0); }
      case "DIVIDE": { const [a, b] = nums(); if (!b) throw new FormulaError("Divisão por zero"); return a / b; }
      case "AVERAGE": { const n = nums(); if (!n.length) throw new FormulaError("AVERAGE sem valores"); return n.reduce((s, x) => s + x, 0) / n.length; }
      case "MIN": return Math.min(...nums());
      case "MAX": return Math.max(...nums());
      case "COUNT": return args.filter((a) => a !== null && a !== "").length;
      case "ABS": return Math.abs(num(args[0] ?? null, "ABS"));
      case "ROUND": { const d = args[1] == null ? 0 : num(args[1], "ROUND"); const f = 10 ** d; return Math.round(num(args[0] ?? null, "ROUND") * f) / f; }
      case "IF_NULL": return args[0] === null || args[0] === "" ? args[1] ?? null : args[0];
    }
    throw new FormulaError(`Função desconhecida: ${fn}`);
  }

  const v = comparison();
  if (p < toks.length) throw new FormulaError(`Sobrou "${(toks[p] as { v: unknown }).v}" no fim da fórmula`);
  if (typeof v === "number" && !Number.isFinite(v)) throw new FormulaError("Resultado inválido");
  return v;
}

/** Field names referenced by a formula ({Name}). */
export const references = (src: string) => [...src.matchAll(/\{([^}]*)\}/g)].map((m) => m[1].trim());
