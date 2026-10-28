import { and, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "./db/client.js";
import { cardFields, cardLabels, cards, fields, labels, memberships } from "./db/schema.js";
import { validateConnection } from "./connections.js";

type FieldRow = typeof fields.$inferSelect;

/** Empty = nothing filled: undefined, null, "", or an empty list. */
export const isEmpty = (v: unknown) =>
  v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);

/** CPF (11) or CNPJ (14) digits with valid check digits. */
export function isValidDocument(raw: string): boolean {
  const d = raw.replace(/\D/g, "");
  if (!/^(\d{11}|\d{14})$/.test(d) || /^(\d)\1+$/.test(d)) return false;
  const digit = (base: string, weights: number[]) => {
    const r = base.split("").reduce((s, c, i) => s + Number(c) * weights[i], 0) % 11;
    return r < 2 ? 0 : 11 - r;
  };
  if (d.length === 11) {
    const w = (n: number) => Array.from({ length: n }, (_, i) => n + 1 - i);
    return digit(d.slice(0, 9), w(9)) === Number(d[9]) && digit(d.slice(0, 10), w(10)) === Number(d[10]);
  }
  const w1 = [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
  const w2 = [6, ...w1];
  return digit(d.slice(0, 12), w1) === Number(d[12]) && digit(d.slice(0, 13), w2) === Number(d[13]);
}

const bad = (field: { label: string }, why: string) => new TRPCError({ code: "BAD_REQUEST", message: `"${field.label}": ${why}` });
const asList = (v: unknown) => (Array.isArray(v) ? v : null);

/** Types whose value is never written through the card form. */
export const READ_ONLY_TYPES = new Set(["id", "attachment"]);

/** What the shape rules need of a field (a phase field or a database column). */
export type ShapeField = {
  id: string; label: string; type: string; options: unknown; validationRegex: string | null; isUnique: boolean;
  pipeId?: string; // label_select only (labels belong to a pipe)
  settings?: unknown; // connection only
};

/** Normalised text for "valor único" (documents compare by digits: 123.456.789-09 == 12345678909). */
export const uniqueKey = (type: string, v: unknown) => (type === "document" ? String(v).replace(/\D/g, "") : String(v).trim().toLowerCase());

/** Shape/meaning of a value by field type, plus regex and "valor único" (cards of the pipe). */
export async function validateValue(field: FieldRow, value: unknown, orgId: string, exceptCardId?: string) {
  if (READ_ONLY_TYPES.has(field.type)) throw bad(field, "este campo não é preenchido pelo formulário");
  if (isEmpty(value)) return;
  await validateShape(field, value, orgId);
  if (field.isUnique) {
    const others = await db.select({ cardId: cardFields.cardId, value: cardFields.value })
      .from(cardFields).where(eq(cardFields.fieldId, field.id));
    const dup = others.find((o) => o.cardId !== exceptCardId && !isEmpty(o.value) && uniqueKey(field.type, o.value) === uniqueKey(field.type, value));
    if (dup) throw new TRPCError({ code: "CONFLICT", message: `Já existe um card com este valor em "${field.label}".` });
  }
}

/** Type and regex rules only (no uniqueness). `value` is not empty. */
export async function validateShape(field: ShapeField, value: unknown, orgId: string) {
  const opts = (field.options as string[] | null) ?? [];

  switch (field.type) {
    case "select": case "radio":
      if (typeof value !== "string" || !opts.includes(value)) throw bad(field, "opção inválida");
      break;
    case "checklist": {
      const list = asList(value);
      if (!list || list.some((x) => typeof x !== "string" || !opts.includes(x))) throw bad(field, "opção inválida");
      break;
    }
    case "time":
      if (typeof value !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) throw bad(field, "hora inválida");
      break;
    case "date": case "due_date":
      if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw bad(field, "data inválida");
      break;
    case "email":
      if (typeof value !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw bad(field, "e-mail inválido");
      break;
    case "document":
      if (typeof value !== "string" || !isValidDocument(value)) throw bad(field, "CPF/CNPJ inválido");
      break;
    case "number": case "currency":
      if (typeof value !== "number" || !Number.isFinite(value)) throw bad(field, "número inválido");
      break;
    case "assignee_select": {
      const ids = asList(value);
      if (!ids || ids.some((x) => typeof x !== "string")) throw bad(field, "responsável inválido");
      const ok = await db.select({ userId: memberships.userId }).from(memberships)
        .where(and(eq(memberships.orgId, orgId), inArray(memberships.userId, ids as string[])));
      if (ok.length !== new Set(ids).size) throw bad(field, "responsável inválido");
      break;
    }
    case "connection":
      await validateConnection({ label: field.label, settings: field.settings }, value);
      break;
    case "label_select": {
      const ids = asList(value);
      if (!ids || ids.some((x) => typeof x !== "string")) throw bad(field, "etiqueta inválida");
      const ok = await db.select({ id: labels.id }).from(labels)
        .where(and(eq(labels.pipeId, field.pipeId ?? ""), inArray(labels.id, ids as string[])));
      if (ok.length !== new Set(ids).size) throw bad(field, "etiqueta inválida");
      break;
    }
  }

  if (field.validationRegex && typeof value === "string" && !new RegExp(field.validationRegex).test(value)) {
    throw bad(field, "formato inválido");
  }
}

/** Fields that drive card attributes: "Data de vencimento" → card due date;
 *  "Etiqueta" → the card's labels. Call after the value is stored. */
export async function applySideEffects(field: FieldRow, cardId: string, value: unknown) {
  if (field.type === "due_date") {
    const due = typeof value === "string" && value ? new Date(`${value}T23:59:00`) : null;
    await db.update(cards).set({ dueDate: due }).where(eq(cards.id, cardId));
  }
  if (field.type === "label_select") {
    const ids = [...new Set((asList(value) ?? []) as string[])];
    await db.delete(cardLabels).where(eq(cardLabels.cardId, cardId));
    if (ids.length) await db.insert(cardLabels).values(ids.map((labelId) => ({ cardId, labelId })));
  }
}
