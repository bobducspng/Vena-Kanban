import type { CardFieldValue, FieldDef, Label, User } from "../data/types";

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

/** A field value as short display text (board subtitles, lists). Empty → "". */
export function formatValue(
  def: FieldDef,
  value: CardFieldValue["value"] | undefined,
  ctx: { members?: User[]; labels?: Label[] } = {}
): string {
  if (value === undefined || value === null || value === "") return "";
  if (Array.isArray(value)) {
    if (def.type === "assignee_select") return value.map((id) => ctx.members?.find((m) => m.id === id)?.name ?? "?").join(", ");
    if (def.type === "label_select") return value.map((id) => ctx.labels?.find((l) => l.id === id)?.name ?? "?").join(", ");
    if (def.type === "attachment") return value.length ? `${value.length} arquivo(s)` : "";
    return value.join(", ");
  }
  if (typeof value === "boolean") return value ? "Sim" : "Não";
  if (def.type === "currency" && typeof value === "number") return brl.format(value);
  if ((def.type === "date" || def.type === "due_date") && typeof value === "string") {
    const [y, m, d] = value.split("-");
    return d ? `${d}/${m}/${y}` : value;
  }
  if (def.type === "datetime" && typeof value === "string") return new Date(value).toLocaleString("pt-BR");
  return String(value);
}
