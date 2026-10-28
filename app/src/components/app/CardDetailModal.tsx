import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle2, Copy, Link2, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { api, RequiredFieldError } from "../../data/store";
import { isConflict } from "../../lib/trpc";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Input } from "../ui/Input";
import { Tag } from "../ui/Tag";
import { useToast } from "../ui/Toast";
import type { CardEvent, CardFieldValue, FieldDef, Phase, User } from "../../data/types";
import { AssigneesSection, AttachmentsSection, ChecklistSection, CommentsSection, DueDateSection, LabelsSection } from "./CardSections";
import { fieldStates } from "../../lib/conditions";
import { withState } from "../../lib/useFieldStates";

/** S06 — card detail in two columns: left = title, actions and phase fields;
 *  right = phase + "Mover para", assignees, labels, due date, checklist,
 *  attachments, comments and history. Fetched by id so it stays fresh. */
export function CardDetailModal({ cardId, pipeId, open, onOpenChange }: { cardId: string | null; pipeId: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const qc = useQueryClient();
  const toast = useToast();

  const { data: card } = useQuery({
    queryKey: ["card", cardId],
    queryFn: () => api.card.get(cardId!),
    enabled: !!cardId,
  });
  const { data: phases } = useQuery({ queryKey: ["phases", pipeId], queryFn: () => api.phase.listByPipe(pipeId) });
  const { data: fields } = useQuery({ queryKey: ["fields", pipeId], queryFn: () => api.field.listByPipe(pipeId) });
  const { data: members } = useQuery({ queryKey: ["users"], queryFn: api.user.list });
  const { data: conditions } = useQuery({ queryKey: ["conditions", pipeId], queryFn: () => api.condition.listByPipe(pipeId) });
  const { data: parents } = useQuery({ queryKey: ["parents", cardId], queryFn: () => api.card.parents(cardId!), enabled: !!cardId });
  const { data: events } = useQuery({
    queryKey: ["events", cardId],
    queryFn: () => api.event.listByCard(cardId!),
    enabled: !!cardId,
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["cards", pipeId] });
    qc.invalidateQueries({ queryKey: ["card", cardId] });
    qc.invalidateQueries({ queryKey: ["events", cardId] });
  };
  const onError = (e: unknown) => toast(e instanceof Error ? e.message : "Algo deu errado", "error");

  const move = useMutation({
    // Send the loaded version so the server can reject a stale move (BUG-005).
    mutationFn: (toPhaseId: string) => api.card.move({ cardId: cardId!, toPhaseId, version: card?.version }),
    onSuccess: (c) => { refresh(); toast(c.done ? "Card concluído 🎉" : "Card movido", "success"); },
    onError: (err) => {
      if (err instanceof RequiredFieldError) { toast(err.message, "error"); return; }
      if (isConflict(err)) { refresh(); toast("O card foi alterado por outra pessoa. Recarregado.", "error"); return; }
      onError(err);
    },
  });
  const remove = useMutation({
    mutationFn: () => api.card.remove(cardId!),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cards", pipeId] }); qc.invalidateQueries({ queryKey: ["trash", pipeId] }); onOpenChange(false); toast("Card enviado para a lixeira", "success"); },
    onError,
  });
  const duplicate = useMutation({
    mutationFn: () => api.card.duplicate(cardId!),
    onSuccess: (c) => { qc.invalidateQueries({ queryKey: ["cards", pipeId] }); toast(`Cópia criada: #${c.number}`, "success"); },
    onError,
  });

  if (!card || !phases) return null;
  const current = phases.find((p) => p.id === card.currentPhaseId);
  // A ?card= link to a card of another pipe: nothing to show on this board.
  if (!current || card.pipeId !== pipeId) return null;
  // "Mover para": only the phases configured for the current phase, in board order.
  const targets = phases.filter((p) => current.allowedTo.includes(p.id));
  // Fields of the phases the card has reached (start → current), in order (BUG-003:
  // not only the start phase). Future phases stay hidden, as in the original.
  // Each phase's conditionals decide which of its fields show and which are required
  // (evaluated on the saved values of the whole card).
  const values = Object.fromEntries(card.values.map((v) => [v.fieldId, v.value]));
  const groups = phases
    .filter((ph) => ph.position <= current.position)
    .map((ph) => {
      const defs = (fields ?? []).filter((f) => f.phaseId === ph.id).sort((a, b) => a.position - b.position);
      const states = fieldStates(defs, (conditions ?? []).filter((c) => c.phaseId === ph.id), values);
      return {
        phase: ph,
        defs: defs.filter((f) => states.get(f.id)?.visible !== false).map((f) => withState(f, states.get(f.id))),
      };
    })
    .filter((g) => g.defs.length > 0);

  return (
    <Modal open={open} onOpenChange={onOpenChange} title={`Card #${card.number}`} size="wide">
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        {/* Left: title, actions, fields */}
        <div className="flex min-w-0 flex-col gap-5">
          <TitleEditor cardId={card.id} title={card.title} onSaved={refresh} />
          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant="secondary" loading={duplicate.isPending} onClick={() => duplicate.mutate()}><Copy className="h-4 w-4" aria-hidden="true" /> Duplicar</Button>
            <Button size="sm" variant="secondary" loading={remove.isPending} onClick={() => { if (confirm("Enviar este card para a lixeira? Dá para restaurar depois.")) remove.mutate(); }}>
              <Trash2 className="h-4 w-4" aria-hidden="true" /> Excluir
            </Button>
          </div>

          <section aria-label="Campos" className="flex flex-col gap-5">
            {groups.length === 0 && <p className="text-sm text-muted">Nenhum campo nas fases alcançadas.</p>}
            {groups.map((g) => (
              <div key={g.phase.id} className="flex flex-col gap-4 rounded-lg border border-border p-4">
                <div className="flex items-center gap-2">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{g.phase.name}</h3>
                  {g.phase.id === current.id && <Tag color={g.phase.color}>fase atual</Tag>}
                </div>
                {g.defs.map((f) => (
                  <CardFieldEditor
                    key={f.id}
                    cardId={card.id}
                    def={f}
                    saved={card.values.find((v) => v.fieldId === f.id)?.value ?? undefined}
                    disabled={f.phaseId !== current.id && !f.editableOtherPhases}
                    card={card}
                    onSaved={refresh}
                  />
                ))}
              </div>
            ))}
          </section>
        </div>

        {/* Right: phase + move, card features, activity */}
        <aside className="flex min-w-0 flex-col gap-5 lg:border-l lg:border-border lg:pl-6">
          <section aria-label="Fase" className="flex flex-col gap-2 rounded-lg bg-surface p-3">
            <div className="flex items-center gap-2 text-sm text-muted">
              Fase atual: <Tag color={current.color}>{current.name}</Tag>
              {card.done && <span className="inline-flex items-center gap-1 text-sm font-medium text-success"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Concluído</span>}
            </div>
            {targets.length === 0 ? (
              <p className="text-xs text-muted">Esta fase não tem destinos configurados.</p>
            ) : (
              <div className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">Mover para:</span>
                {targets.map((t) => {
                  const back = t.position < current.position;
                  return (
                    <Button key={t.id} size="sm" className="justify-between" variant={back ? "secondary" : "primary"} disabled={move.isPending} onClick={() => move.mutate(t.id)}>
                      {back && <ArrowLeft className="h-4 w-4" aria-hidden="true" />} {t.name} {!back && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
                    </Button>
                  );
                })}
              </div>
            )}
          </section>

          {!!parents?.length && (
            <section aria-label="Conectado a" className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Conectado a</h3>
              <ul className="flex flex-col gap-1.5">
                {parents.map((p) => (
                  <li key={`${p.cardId}-${p.fieldLabel}`}>
                    <Link to={`/pipes/${p.pipeId}?card=${p.cardId}`} onClick={() => onOpenChange(false)}
                      className="flex items-start gap-2 rounded-md border border-border px-3 py-2 hover:border-accent">
                      <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
                      <span className="min-w-0">
                        <span className="block truncate text-sm text-text">#{p.number} · {p.title}</span>
                        <span className="block truncate text-xs text-muted">{p.pipeName} · {p.fieldLabel}{p.done ? " · concluído" : ""}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <AssigneesSection card={card} members={members ?? []} onChanged={refresh} />
          <LabelsSection card={card} pipeId={pipeId} onChanged={refresh} />
          <DueDateSection card={card} onChanged={refresh} />
          <ChecklistSection cardId={card.id} onChanged={refresh} />
          <AttachmentsSection cardId={card.id} onChanged={refresh} />
          <CommentsSection cardId={card.id} members={members ?? []} onChanged={refresh} />

          <section aria-label="Histórico" className="flex flex-col gap-2 border-t border-border pt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Histórico</h3>
            <ul className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
              {[...(events ?? [])].reverse().map((e) => (
                <li key={e.id} className="text-xs text-muted">
                  {describe(e, phases, members ?? [])} · {new Date(e.createdAt).toLocaleString("pt-BR")}
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </div>
    </Modal>
  );
}

/** Click-to-edit title; saves on blur or Enter. */
function TitleEditor({ cardId, title, onSaved }: { cardId: string; title: string; onSaved: () => void }) {
  const toast = useToast();
  const [draft, setDraft] = useState(title);
  useEffect(() => { setDraft(title); }, [title]);
  const save = useMutation({
    mutationFn: (t: string) => api.card.update({ cardId, title: t }),
    onSuccess: onSaved,
    onError: (e) => { setDraft(title); toast(e instanceof Error ? e.message : "Não foi possível salvar", "error"); },
  });
  const commit = () => { const t = draft.trim(); if (t && t !== title) save.mutate(t); else setDraft(title); };
  return (
    <Input aria-label="Título do card" value={draft} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
      onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
      className="h-auto border-transparent px-1 py-1 text-xl font-semibold hover:border-border-input" />
  );
}

// Typed inputs save after a pause; choices save at once.
const IMMEDIATE = new Set(["select", "radio", "checkbox", "checklist", "date", "datetime", "time", "due_date", "assignee_select", "label_select", "connection"]);

/** One field on an open card: local draft, debounced save, server errors as a toast
 *  (and the draft rolls back to the saved value). */
function CardFieldEditor({ cardId, def, saved, disabled, card, onSaved }: {
  cardId: string; def: FieldDef; saved: CardFieldValue["value"] | undefined; disabled: boolean; card: { id: string; number: number }; onSaved: () => void;
}) {
  const toast = useToast();
  const [draft, setDraft] = useState(saved);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { setDraft(saved); }, [saved]);
  useEffect(() => () => clearTimeout(timer.current), []);

  const save = useMutation({
    mutationFn: (value: CardFieldValue["value"]) => api.card.updateField({ cardId, fieldId: def.id, value }),
    onSuccess: onSaved,
    onError: (err) => { setDraft(saved); toast(err instanceof Error ? err.message : "Não foi possível salvar", "error"); },
  });

  const onChange = (v: CardFieldValue["value"]) => {
    setDraft(v);
    clearTimeout(timer.current);
    if (IMMEDIATE.has(def.type)) save.mutate(v);
    else timer.current = setTimeout(() => save.mutate(v), 700);
  };

  return <Field def={def} value={draft} onChange={onChange} disabled={disabled} card={card} />;
}

function describe(e: CardEvent, phases: Phase[], members: User[]): string {
  const who = e.automation ? `Automação "${e.automation}"` : members.find((m) => m.id === e.actorId)?.name ?? "Alguém";
  const phase = (id?: string | null) => phases.find((p) => p.id === id)?.name ?? "?";
  switch (e.type) {
    case "created": return `${who} criou o card`;
    case "moved": return `${who} moveu de ${phase(e.fromPhaseId)} para ${phase(e.toPhaseId)}`;
    case "field_updated": return `${who} atualizou um campo`;
    case "title_updated": return `${who} alterou o título`;
    case "due_date_changed": return `${who} alterou o vencimento`;
    case "assignees_changed": return `${who} alterou os responsáveis`;
    case "labels_changed": return `${who} alterou as etiquetas`;
    case "commented": return `${who} comentou`;
    case "comment_deleted": return `${who} excluiu um comentário`;
    case "attachment_added": return `${who} anexou um arquivo`;
    case "attachment_removed": return `${who} removeu um anexo`;
    case "deleted": return `${who} enviou para a lixeira`;
    case "restored": return `${who} restaurou da lixeira`;
    default: return e.type;
  }
}
