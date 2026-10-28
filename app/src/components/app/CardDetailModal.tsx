import { useEffect, useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { api, RequiredFieldError } from "../../data/store";
import { isConflict } from "../../lib/trpc";
import { Modal } from "../ui/Modal";
import { Button } from "../ui/Button";
import { Field } from "../ui/Field";
import { Tag } from "../ui/Tag";
import { useToast } from "../ui/Toast";
import type { CardFieldValue, FieldDef } from "../../data/types";

/** S06 — card detail: fields, phase movement (required-gated), activity log.
 *  Fetches the card by id so it stays fresh after a move (no stale prop). */
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


  const move = useMutation({
    // Send the loaded version so the server can reject a stale move (BUG-005).
    mutationFn: (toPhaseId: string) => api.card.move({ cardId: cardId!, toPhaseId, version: card?.version }),
    onSuccess: (c) => { refresh(); toast(c.done ? "Card concluído 🎉" : "Card movido", "success"); },
    onError: (err) => {
      if (err instanceof RequiredFieldError) { toast(err.message, "error"); return; }
      if (isConflict(err)) { refresh(); toast("O card foi alterado por outra pessoa. Recarregado.", "error"); return; }
      toast("Não foi possível mover", "error");
    },
  });

  if (!card || !phases) return null;
  const current = phases.find((p) => p.id === card.currentPhaseId)!;
  const idx = phases.findIndex((p) => p.id === current.id);
  const prev = phases[idx - 1];
  const next = phases[idx + 1];
  // Fields of the phases the card has reached (start → current), in order (BUG-003:
  // not only the start phase). Future phases stay hidden, as in the original.
  const groups = phases
    .filter((ph) => ph.position <= current.position)
    .map((ph) => ({
      phase: ph,
      defs: (fields ?? []).filter((f) => f.phaseId === ph.id).sort((a, b) => a.position - b.position),
    }))
    .filter((g) => g.defs.length > 0);

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`#${card.number} · ${card.title}`}
      footer={
        <div className="flex w-full items-center justify-between">
          <Button variant="secondary" onClick={() => prev && move.mutate(prev.id)} disabled={!prev || move.isPending}>
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> {prev ? prev.name : "Início"}
          </Button>
          {card.done ? (
            <span className="inline-flex items-center gap-1.5 text-sm font-medium text-success">
              <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Concluído
            </span>
          ) : (
            <Button onClick={() => next && move.mutate(next.id)} disabled={!next || move.isPending} loading={move.isPending}>
              {next ? next.name : "Fim"} <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </Button>
          )}
        </div>
      }
    >
      <div className="flex flex-col gap-5">
        <div className="flex items-center gap-2 text-sm text-muted">
          Fase atual: <Tag color={current.color}>{current.name}</Tag>
        </div>

        <section aria-label="Campos" className="flex flex-col gap-5">
          {groups.map((g) => (
            <div key={g.phase.id} className="flex flex-col gap-4">
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
                  onSaved={refresh}
                />
              ))}
            </div>
          ))}
        </section>

        <section aria-label="Histórico" className="border-t border-border pt-4">
          <h3 className="mb-2 text-sm font-semibold text-text">Histórico</h3>
          <ul className="flex flex-col gap-1.5">
            {events?.map((e) => (
              <li key={e.id} className="text-xs text-muted">
                {describe(e.type)} · {new Date(e.createdAt).toLocaleString("pt-BR")}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </Modal>
  );
}

// Typed inputs save after a pause; choices save at once.
const IMMEDIATE = new Set(["select", "radio", "checkbox", "date", "datetime", "due_date"]);

/** One field on an open card: local draft, debounced save, server errors as a toast
 *  (and the draft rolls back to the saved value). */
function CardFieldEditor({ cardId, def, saved, disabled, onSaved }: {
  cardId: string; def: FieldDef; saved: CardFieldValue["value"] | undefined; disabled: boolean; onSaved: () => void;
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

  return <Field def={def} value={draft} onChange={onChange} disabled={disabled} />;
}

function describe(type: string): string {
  switch (type) {
    case "created": return "Card criado";
    case "moved": return "Card movido de fase";
    case "field_updated": return "Campo atualizado";
    case "commented": return "Comentário adicionado";
    default: return type;
  }
}
