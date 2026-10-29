import { eq, inArray } from "drizzle-orm";
import { db } from "./db/client.js";
import { cardAssignees, cardFields, cards, fields, labels, phases, pipes, requests, tableRecords, users } from "./db/schema.js";
import { env } from "./env.js";
import { requestUrl } from "./trpc/routers/outside.js";

/**
 * Placeholders {…} filled with a card's data — e-mail templates and the HTTP action.
 *   {Nome do campo}  {#}  {Título}  {Fase}  {Pipe}  {Link do card}
 *   {Solicitante}  {Responsáveis}  {Link de acompanhamento}
 * Values are shown the Brazilian way (datas dd/mm/aaaa, R$, Sim/Não) and ids become
 * names (pessoas, etiquetas, itens conectados).
 */

const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dmy = (s: string) => { const [y, m, d] = s.slice(0, 10).split("-"); return d ? `${d}/${m}/${y}` : s; };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export interface CardContext {
  /** Fill {…} in `tpl`; `esc` escapes each inserted value (URL-encode, JSON, …). */
  fill: (tpl: string, esc?: (s: string) => string) => string;
  /** Recipient list from "a@b.com, {E-mail do fornecedor}; {Solicitante}". Invalid ones dropped. */
  recipients: (spec: string) => string[];
  /** Every filled field, in form order (phase, then position) — the PDF's {Todos os campos}. */
  entries: () => { phase: string; label: string; value: string }[];
  card: { number: number; title: string };
}

export async function cardContext(cardId: string): Promise<CardContext> {
  const card = (await db.select({ id: cards.id, number: cards.number, title: cards.title, pipeId: cards.pipeId, phaseId: cards.currentPhaseId }).from(cards).where(eq(cards.id, cardId)).limit(1))[0];
  if (!card) throw new Error("card não encontrado");
  const [defs, vals, phase, pipe, req, asg] = await Promise.all([
    db.select({ id: fields.id, label: fields.label, type: fields.type, phaseId: fields.phaseId, position: fields.position, archivedAt: fields.archivedAt }).from(fields).where(eq(fields.pipeId, card.pipeId)),
    db.select().from(cardFields).where(eq(cardFields.cardId, cardId)),
    db.select({ name: phases.name }).from(phases).where(eq(phases.id, card.phaseId)).limit(1),
    db.select({ name: pipes.name }).from(pipes).where(eq(pipes.id, card.pipeId)).limit(1),
    db.select({ email: requests.email, token: requests.accessToken }).from(requests).where(eq(requests.cardId, cardId)).limit(1),
    db.select({ email: users.email, name: users.name }).from(cardAssignees).innerJoin(users, eq(users.id, cardAssignees.userId)).where(eq(cardAssignees.cardId, cardId)),
  ]);
  const value = new Map(vals.map((v) => [v.fieldId, v.value]));
  const phaseList = await db.select({ id: phases.id, name: phases.name, position: phases.position }).from(phases).where(eq(phases.pipeId, card.pipeId));

  // Ids inside list values → names.
  const ids = vals.flatMap((v) => (Array.isArray(v.value) ? (v.value as string[]) : []));
  const [people, lbls, recs, linked] = ids.length ? await Promise.all([
    db.select({ id: users.id, name: users.name, email: users.email }).from(users).where(inArray(users.id, ids)),
    db.select({ id: labels.id, name: labels.name }).from(labels).where(inArray(labels.id, ids)),
    db.select({ id: tableRecords.id, title: tableRecords.title }).from(tableRecords).where(inArray(tableRecords.id, ids)),
    db.select({ id: cards.id, number: cards.number, title: cards.title }).from(cards).where(inArray(cards.id, ids)),
  ]) : [[], [], [], []];

  const show = (fieldId: string): string => {
    const f = defs.find((d) => d.id === fieldId);
    const v = value.get(fieldId);
    if (v === undefined || v === null || v === "") return "";
    if (Array.isArray(v)) {
      const names = (v as string[]).map((id) =>
        people.find((p) => p.id === id)?.name ?? lbls.find((l) => l.id === id)?.name ?? recs.find((r) => r.id === id)?.title ??
        (() => { const c = linked.find((x) => x.id === id); return c ? `#${c.number} ${c.title}` : undefined; })() ?? id);
      return f?.type === "attachment" ? `${v.length} arquivo(s)` : names.join(", ");
    }
    if (typeof v === "boolean") return v ? "Sim" : "Não";
    if (f?.type === "currency" && typeof v === "number") return brl.format(v);
    if (f && ["date", "due_date"].includes(f.type) && typeof v === "string") return dmy(v);
    if (f?.type === "datetime" && typeof v === "string") return `${dmy(v)} ${v.slice(11, 16)}`;
    return String(v);
  };

  const special: Record<string, () => string> = {
    "#": () => String(card.number),
    "id do card": () => String(card.number),
    "título": () => card.title,
    "titulo": () => card.title,
    "fase": () => phase[0]?.name ?? "",
    "pipe": () => pipe[0]?.name ?? "",
    "link do card": () => `${env.PUBLIC_BASE_URL}/pipes/${card.pipeId}?card=${card.id}`,
    "solicitante": () => req[0]?.email ?? "",
    "responsáveis": () => asg.map((a) => a.email).join(", "),
    "responsaveis": () => asg.map((a) => a.email).join(", "),
    "link de acompanhamento": () => (req[0] ? requestUrl(req[0].token) : ""),
  };
  const resolve = (raw: string) => {
    const name = raw.trim().toLowerCase();
    if (special[name]) return special[name]();
    const f = defs.find((d) => d.label.trim().toLowerCase() === name);
    return f ? show(f.id) : "";
  };

  return {
    fill: (tpl, esc = (s) => s) => tpl.replace(/\{([^}]*)\}/g, (_m, raw: string) => esc(resolve(raw))),
    card: { number: card.number, title: card.title },
    entries: () => {
      const order = new Map(phaseList.map((p) => [p.id, p]));
      return defs
        .filter((d) => !d.archivedAt && !["statement", "id"].includes(d.type) && order.has(d.phaseId))
        .sort((a, b) => order.get(a.phaseId)!.position - order.get(b.phaseId)!.position || a.position - b.position)
        .map((d) => ({ phase: order.get(d.phaseId)!.name, label: d.label, value: show(d.id) }))
        .filter((e) => e.value !== "");
    },
    recipients: (spec) => [...new Set(
      spec.replace(/\{([^}]*)\}/g, (_m, raw: string) => resolve(raw)).split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter((s) => EMAIL.test(s)),
    )],
  };
}
