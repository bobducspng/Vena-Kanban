import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, Flag, CheckCircle2 } from "lucide-react";
import { api } from "../data/store";
import { useMe } from "../lib/useMe";
import { EDITABLE_FIELD_TYPES, PHASE_COLORS, UNIQUE_FIELD_TYPES, type EditableFieldType, type FieldDef, type Phase, type PhaseColor } from "../data/types";
import { AppShell } from "../components/app/AppShell";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";
import { Tag } from "../components/ui/Tag";
import { Modal } from "../components/ui/Modal";
import { Textarea } from "../components/ui/Textarea";
import { useToast } from "../components/ui/Toast";
import { cn } from "../lib/cn";

const COLOR_LABEL: Record<PhaseColor, string> = {
  gray: "Cinza", red: "Vermelho", orange: "Laranja", amber: "Âmbar", green: "Verde",
  teal: "Verde-azulado", blue: "Azul", purple: "Roxo", pink: "Rosa",
};
const TYPE_LABEL = Object.fromEntries(EDITABLE_FIELD_TYPES.map((t) => [t.value, t.label])) as Record<string, string>;
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado");

/** Swap item i with i+dir and return the ids in the new order. */
function moved<T extends { id: string }>(list: T[], i: number, dir: -1 | 1): string[] {
  const ids = list.map((x) => x.id);
  [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]];
  return ids;
}

/** S11 — pipe settings: phases (order, colour, start/end) and each phase's fields. */
export function PipeSettings() {
  const { pipeId = "" } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newPhase, setNewPhase] = useState("");

  const { data: pipe } = useQuery({ queryKey: ["pipe", pipeId], queryFn: () => api.pipe.get(pipeId) });
  const { data: phases, isLoading } = useQuery({ queryKey: ["phases", pipeId], queryFn: () => api.phase.listByPipe(pipeId) });
  const { data: fields } = useQuery({ queryKey: ["fields", pipeId], queryFn: () => api.field.listByPipe(pipeId) });

  useEffect(() => {
    if (phases?.length && !phases.some((p) => p.id === selectedId)) setSelectedId(phases[0].id);
  }, [phases, selectedId]);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["phases", pipeId] });
    qc.invalidateQueries({ queryKey: ["fields"] });
    qc.invalidateQueries({ queryKey: ["cards", pipeId] });
  };
  const onError = (e: unknown) => toast(errMsg(e), "error");

  const createPhase = useMutation({
    mutationFn: () => api.phase.create({ pipeId, name: newPhase.trim() }),
    onSuccess: (p) => { setNewPhase(""); setSelectedId(p.id); refresh(); },
    onError,
  });
  const reorder = useMutation({ mutationFn: (ids: string[]) => api.phase.reorder(pipeId, ids), onSuccess: refresh, onError });

  const selected = phases?.find((p) => p.id === selectedId);
  const { me, isAdmin } = useMe();

  if (me && !isAdmin) {
    return (
      <AppShell title="Configurações">
        <div className="p-6 text-sm text-muted">
          Só administradores configuram pipes. <Link to={`/pipes/${pipeId}`} className="text-accent">Voltar ao quadro</Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={pipe ? `${pipe.name} · Configurações` : "Configurações"}>
      <div className="flex flex-col gap-4 p-4">
        <div>
          <Link to={`/pipes/${pipeId}`} className="text-xs text-muted hover:text-accent">← Voltar ao quadro</Link>
          <h2 className="text-lg text-text">Fases e campos</h2>
          <p className="text-sm text-muted">Defina as etapas do processo e o que deve ser preenchido em cada uma.</p>
        </div>

        {isLoading || !phases ? (
          <div className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" label="Carregando" /> Carregando…</div>
        ) : (
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            {/* Phase list */}
            <section aria-label="Fases" className="flex w-full flex-col gap-2 rounded-lg bg-surface p-3 lg:w-80 lg:shrink-0">
              <h3 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted">Fases</h3>
              <ol className="flex flex-col gap-1">
                {phases.map((p, i) => (
                  <li key={p.id} className={cn("flex items-center gap-1 rounded-md border border-transparent", p.id === selectedId && "border-accent bg-bg")}>
                    <button onClick={() => setSelectedId(p.id)} className="flex min-w-0 flex-1 items-center gap-2 px-2 py-2 text-left">
                      <Tag color={p.color}>{p.name}</Tag>
                      {p.isStart && <span className="text-xs text-muted">inicial</span>}
                      {p.isEnd && <span className="text-xs text-muted">final</span>}
                    </button>
                    <button aria-label={`Subir ${p.name}`} disabled={i === 0 || reorder.isPending} onClick={() => reorder.mutate(moved(phases, i, -1))} className="rounded p-1 text-muted hover:bg-surface disabled:opacity-30">
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button aria-label={`Descer ${p.name}`} disabled={i === phases.length - 1 || reorder.isPending} onClick={() => reorder.mutate(moved(phases, i, 1))} className="rounded p-1 text-muted hover:bg-surface disabled:opacity-30">
                      <ArrowDown className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ol>
              <form className="mt-2 flex gap-2" onSubmit={(e) => { e.preventDefault(); if (newPhase.trim()) createPhase.mutate(); }}>
                <Input aria-label="Nome da nova fase" placeholder="Nova fase" value={newPhase} onChange={(e) => setNewPhase(e.target.value)} />
                <Button type="submit" size="md" disabled={!newPhase.trim()} loading={createPhase.isPending}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar
                </Button>
              </form>
            </section>

            {/* Selected phase editor */}
            {selected && (
              <PhaseEditor
                key={selected.id}
                phase={selected}
                phases={phases}
                fields={(fields ?? []).filter((f) => f.phaseId === selected.id).sort((a, b) => a.position - b.position)}
                onChanged={refresh}
              />
            )}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function PhaseEditor({ phase, phases, fields, onChanged }: { phase: Phase; phases: Phase[]; fields: FieldDef[]; onChanged: () => void }) {
  const toast = useToast();
  const [name, setName] = useState(phase.name);
  const [description, setDescription] = useState(phase.description ?? "");
  const [editing, setEditing] = useState<FieldDef | "new" | null>(null);
  const onError = (e: unknown) => toast(errMsg(e), "error");

  const update = useMutation({
    mutationFn: (patch: { name?: string; color?: PhaseColor; isEnd?: boolean; description?: string | null; canCreateCard?: boolean }) =>
      api.phase.update({ phaseId: phase.id, ...patch }),
    onSuccess: onChanged,
    onError: (e) => { setName(phase.name); setDescription(phase.description ?? ""); onError(e); },
  });
  const transitions = useMutation({
    mutationFn: (ids: string[]) => api.phase.setTransitions(phase.id, ids),
    onSuccess: onChanged,
    onError,
  });
  const toggleTarget = (id: string, on: boolean) =>
    transitions.mutate(on ? [...phase.allowedTo, id] : phase.allowedTo.filter((x) => x !== id));
  const saveDescription = () => {
    const d = description.trim();
    if (d !== (phase.description ?? "")) update.mutate({ description: d || null });
  };
  const setStart = useMutation({ mutationFn: () => api.phase.setStart(phase.id), onSuccess: () => { onChanged(); toast("Fase inicial alterada", "success"); }, onError });
  const remove = useMutation({ mutationFn: () => api.phase.remove(phase.id), onSuccess: () => { onChanged(); toast("Fase excluída", "success"); }, onError });
  const reorderFields = useMutation({ mutationFn: (ids: string[]) => api.field.reorder(phase.id, ids), onSuccess: onChanged, onError });
  const removeField = useMutation({ mutationFn: (id: string) => api.field.remove(id), onSuccess: () => { onChanged(); toast("Campo excluído", "success"); }, onError });

  const saveName = () => { const n = name.trim(); if (n && n !== phase.name) update.mutate({ name: n }); else setName(phase.name); };

  return (
    <section aria-label={`Fase ${phase.name}`} className="flex min-w-0 flex-1 flex-col gap-5 rounded-lg border border-border bg-bg p-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="phase-name" className="text-sm font-medium text-text">Nome da fase</label>
          <Input id="phase-name" value={name} onChange={(e) => setName(e.target.value)} onBlur={saveName} onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="phase-color" className="text-sm font-medium text-text">Cor</label>
          <Select id="phase-color" value={phase.color} onValueChange={(c) => update.mutate({ color: c as PhaseColor })}
            options={PHASE_COLORS.map((c) => ({ value: c, label: COLOR_LABEL[c] }))} />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="phase-description" className="text-sm font-medium text-text">Descrição <span className="text-muted">(opcional, aparece no topo da coluna)</span></label>
        <Textarea id="phase-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} onBlur={saveDescription} />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <label className="inline-flex items-center gap-2 text-sm text-text">
          <input type="checkbox" className="h-4 w-4 accent-accent" checked={phase.isEnd} onChange={(e) => update.mutate({ isEnd: e.target.checked })} />
          <CheckCircle2 className="h-4 w-4 text-muted" aria-hidden="true" /> Fase final (card chega aqui = concluído)
        </label>
        {!phase.isStart && (
          <label className="inline-flex items-center gap-2 text-sm text-text">
            <input type="checkbox" className="h-4 w-4 accent-accent" checked={phase.canCreateCard} onChange={(e) => update.mutate({ canCreateCard: e.target.checked })} />
            Permitir criar cards direto nesta fase
          </label>
        )}
        {phase.isStart ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-muted"><Flag className="h-4 w-4" aria-hidden="true" /> Fase inicial: novos cards entram aqui, e os campos dela formam o formulário de abertura</span>
        ) : (
          <Button variant="secondary" size="sm" onClick={() => setStart.mutate()} loading={setStart.isPending}>
            <Flag className="h-4 w-4" aria-hidden="true" /> Tornar fase inicial
          </Button>
        )}
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-text">Mover para</legend>
        <p className="text-xs text-muted">Para quais fases um card desta fase pode ser movido. Fases novas já vêm ligadas à vizinha, então por padrão o card anda uma fase por vez.</p>
        <div className="flex flex-wrap gap-x-4 gap-y-2">
          {phases.filter((p) => p.id !== phase.id).map((p) => (
            <label key={p.id} className="inline-flex items-center gap-2 text-sm text-text">
              <input type="checkbox" className="h-4 w-4 accent-accent" disabled={transitions.isPending}
                checked={phase.allowedTo.includes(p.id)} onChange={(e) => toggleTarget(p.id, e.target.checked)} />
              <Tag color={p.color}>{p.name}</Tag>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text">Campos desta fase</h3>
          <Button size="sm" onClick={() => setEditing("new")}><Plus className="h-4 w-4" aria-hidden="true" /> Adicionar campo</Button>
        </div>
        {fields.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted">Nenhum campo. Adicione o que a equipe deve preencher nesta fase.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-border rounded-md border border-border">
            {fields.map((f, i) => (
              <li key={f.id} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text">{f.label}{f.required && <span className="ml-1 text-danger" title="Obrigatório">*</span>}</p>
                  <p className="text-xs text-muted">
                    {TYPE_LABEL[f.type] ?? f.type}{f.required ? " · obrigatório" : ""}
                    {f.options?.length ? ` · ${f.options.length} opções` : ""}
                  </p>
                </div>
                <button aria-label={`Subir ${f.label}`} disabled={i === 0 || reorderFields.isPending} onClick={() => reorderFields.mutate(moved(fields, i, -1))} className="rounded p-1 text-muted hover:bg-surface disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button aria-label={`Descer ${f.label}`} disabled={i === fields.length - 1 || reorderFields.isPending} onClick={() => reorderFields.mutate(moved(fields, i, 1))} className="rounded p-1 text-muted hover:bg-surface disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                <button aria-label={`Editar ${f.label}`} onClick={() => setEditing(f)} className="rounded p-1 text-muted hover:bg-surface"><Pencil className="h-4 w-4" /></button>
                <button aria-label={`Excluir ${f.label}`} onClick={() => { if (confirm(`Excluir o campo "${f.label}"? Os valores preenchidos nos cards serão apagados.`)) removeField.mutate(f.id); }} className="rounded p-1 text-muted hover:bg-surface hover:text-danger"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="border-t border-border pt-4">
        <Button variant="danger" size="sm" disabled={phase.isStart} loading={remove.isPending}
          title={phase.isStart ? "Defina outra fase como inicial antes" : undefined}
          onClick={() => { if (confirm(`Excluir a fase "${phase.name}" e os campos dela?`)) remove.mutate(); }}>
          <Trash2 className="h-4 w-4" aria-hidden="true" /> Excluir fase
        </Button>
      </div>

      <FieldEditorModal phaseId={phase.id} field={editing} onClose={() => setEditing(null)} onSaved={onChanged} />
    </section>
  );
}

/** Create or edit one field. The type is chosen on creation and cannot change afterwards. */
function FieldEditorModal({ phaseId, field, onClose, onSaved }: { phaseId: string; field: FieldDef | "new" | null; onClose: () => void; onSaved: () => void }) {
  const toast = useToast();
  const existing = field && field !== "new" ? field : null;
  const [label, setLabel] = useState("");
  const [type, setType] = useState<EditableFieldType>("short_text");
  const [required, setRequired] = useState(false);
  const [optionsText, setOptionsText] = useState("");
  const [description, setDescription] = useState("");
  const [help, setHelp] = useState("");
  const [editableOtherPhases, setEditableOtherPhases] = useState(true);
  const [isUnique, setIsUnique] = useState(false);
  const [regex, setRegex] = useState("");

  useEffect(() => {
    setLabel(existing?.label ?? "");
    setType((existing?.type as EditableFieldType) ?? "short_text");
    setRequired(existing?.required ?? false);
    setOptionsText((existing?.options ?? []).join("\n"));
    setDescription(existing?.description ?? "");
    setHelp(existing?.help ?? "");
    setEditableOtherPhases(existing?.editableOtherPhases ?? true);
    setIsUnique(existing?.isUnique ?? false);
    setRegex(existing?.validationRegex ?? "");
  }, [field]); // eslint-disable-line react-hooks/exhaustive-deps

  const hasOptions = type === "select" || type === "radio";
  const canBeUnique = UNIQUE_FIELD_TYPES.includes(type);
  const canRegex = type === "short_text";
  const options = optionsText.split("\n").map((s) => s.trim()).filter(Boolean);
  const regexError = (() => { if (!regex) return ""; try { new RegExp(regex); return ""; } catch { return "Expressão inválida"; } })();

  const props = {
    description: description.trim() || null,
    help: help.trim() || null,
    editableOtherPhases,
    isUnique: canBeUnique && isUnique,
    validationRegex: canRegex && regex ? regex : null,
  };
  const save = useMutation({
    mutationFn: () => existing
      ? api.field.update({ fieldId: existing.id, label: label.trim(), required, options: hasOptions ? options : null, ...props })
      : api.field.create({ phaseId, label: label.trim(), type, required, options: hasOptions ? options : undefined, ...props }),
    onSuccess: () => { onSaved(); toast(existing ? "Campo atualizado" : "Campo criado", "success"); onClose(); },
    onError: (e) => toast(errMsg(e), "error"),
  });

  return (
    <Modal
      open={!!field}
      onOpenChange={(o) => !o && onClose()}
      title={existing ? "Editar campo" : "Novo campo"}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancelar</Button>
          <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!label.trim() || (hasOptions && options.length === 0) || !!regexError}>Salvar</Button>
        </>
      }
    >
      <form className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save.mutate(); }}>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="field-label" className="text-sm font-medium text-text">Nome do campo</label>
          <Input id="field-label" autoFocus value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Ex.: Valor do pedido" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="field-type" className="text-sm font-medium text-text">Tipo</label>
          <Select id="field-type" value={type} disabled={!!existing} onValueChange={(v) => setType(v as EditableFieldType)} options={EDITABLE_FIELD_TYPES.map((t) => ({ value: t.value, label: t.label }))} />
          {existing && <p className="text-xs text-muted">O tipo não pode ser alterado depois de criado. Para mudar, crie um campo novo.</p>}
        </div>
        {hasOptions && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="field-options" className="text-sm font-medium text-text">Opções (uma por linha)</label>
            <Textarea id="field-options" rows={5} value={optionsText} onChange={(e) => setOptionsText(e.target.value)} placeholder={"Baixa\nMédia\nAlta"} />
          </div>
        )}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="field-description" className="text-sm font-medium text-text">Descrição <span className="text-muted">(opcional, aparece abaixo do nome)</span></label>
          <Textarea id="field-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="field-help" className="text-sm font-medium text-text">Texto de ajuda <span className="text-muted">(opcional, dica para quem preenche)</span></label>
          <Input id="field-help" value={help} onChange={(e) => setHelp(e.target.value)} placeholder="Ex.: informe o valor com impostos" />
        </div>
        {canRegex && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="field-regex" className="text-sm font-medium text-text">Validação por expressão regular <span className="text-muted">(opcional)</span></label>
            <Input id="field-regex" value={regex} invalid={!!regexError} onChange={(e) => setRegex(e.target.value)} placeholder="Ex.: ^[A-Z]{3}-\d{4}$" className="font-mono" />
            {regexError && <p className="text-xs text-danger">{regexError}</p>}
          </div>
        )}
        <fieldset className="flex flex-col gap-2">
          <legend className="sr-only">Regras do campo</legend>
          <label className="inline-flex items-center gap-2 text-sm text-text">
            <input type="checkbox" className="h-4 w-4 accent-accent" checked={required} onChange={(e) => setRequired(e.target.checked)} />
            Obrigatório (o card não sai desta fase sem ele)
          </label>
          <label className="inline-flex items-center gap-2 text-sm text-text">
            <input type="checkbox" className="h-4 w-4 accent-accent" checked={editableOtherPhases} onChange={(e) => setEditableOtherPhases(e.target.checked)} />
            Editável em outras fases (depois que o card sair desta fase)
          </label>
          {canBeUnique && (
            <label className="inline-flex items-center gap-2 text-sm text-text">
              <input type="checkbox" className="h-4 w-4 accent-accent" checked={isUnique} onChange={(e) => setIsUnique(e.target.checked)} />
              Valor único (não deixa repetir o valor de outro card do pipe)
            </label>
          )}
        </fieldset>
      </form>
    </Modal>
  );
}
