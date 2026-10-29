import { useEffect, useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, Flag, CheckCircle2, Archive, ArchiveRestore } from "lucide-react";
import { api } from "../data/store";
import { useMe } from "../lib/useMe";
import { EDITABLE_FIELD_TYPES, PHASE_COLORS, type FieldDef, type Phase, type PhaseColor, type Pipe } from "../data/types";
import { AppShell } from "../components/app/AppShell";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";
import { Tag } from "../components/ui/Tag";
import { Textarea } from "../components/ui/Textarea";
import { useToast } from "../components/ui/Toast";
import { ConditionsSection } from "../components/app/ConditionsEditor";
import { DurationInput } from "../components/ui/DurationInput";
import { PublicFormSettings } from "../components/app/PublicFormSettings";
import { EmailTemplatesSection } from "../components/app/EmailParts";
import { FieldEditorModal } from "../components/app/FieldEditorModal";
import { cn } from "../lib/cn";
import { PipeMembers } from "../components/app/PeopleSettings";
import { Avatar } from "../components/ui/Avatar";

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
  const { data: fields } = useQuery({ queryKey: ["fields", pipeId, "all"], queryFn: () => api.field.listByPipe(pipeId, true) });

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
  const { data: calendar } = useQuery({ queryKey: ["calendar"], queryFn: api.calendar.get });
  const workday = calendar ? (() => { const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)); return m(calendar.endTime) - m(calendar.startTime) || 600; })() : 600;

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
          <h2 className="text-lg text-text">Configurações do pipe</h2>
          <p className="text-sm text-muted">Identidade do pipe, etapas do processo e o que deve ser preenchido em cada uma.</p>
        </div>

        {pipe && phases && fields && <PipeSection key={pipe.id} pipe={pipe} phases={phases} fields={fields.filter((f) => !f.archivedAt)} />}

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
                allFields={(fields ?? []).filter((f) => !f.archivedAt)}
                businessDay={pipe?.businessHoursOnly ? workday : null}
                onChanged={refresh}
              />
            )}
          </div>
        )}

        <PublicFormSettings pipeId={pipeId} />

        <EmailTemplatesSection pipeId={pipeId} fields={(fields ?? []).filter((f) => !f.archivedAt)} />

        <LabelsManager pipeId={pipeId} />

        <PipeMembers pipeId={pipeId} />
      </div>
    </AppShell>
  );
}

// Types that can name a card (start-form fields only).
const TITLE_TYPES = ["short_text", "long_text", "select", "radio", "email", "phone", "document", "number", "date"];

/** Pipe identity and how cards look: icon, colour, noun, button text, title field, subtitles; delete. */
function PipeSection({ pipe, phases, fields }: { pipe: Pipe; phases: Phase[]; fields: FieldDef[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [form, setForm] = useState({
    name: pipe.name, description: pipe.description ?? "", icon: pipe.icon ?? "", noun: pipe.noun ?? "", createButtonLabel: pipe.createButtonLabel ?? "",
  });
  const done = () => { qc.invalidateQueries({ queryKey: ["pipe", pipe.id] }); qc.invalidateQueries({ queryKey: ["pipes"] }); };
  const onError = (e: unknown) => toast(errMsg(e), "error");
  const update = useMutation({ mutationFn: (patch: Parameters<typeof api.pipe.update>[0]) => api.pipe.update(patch), onSuccess: done, onError });
  const remove = useMutation({
    mutationFn: () => api.pipe.remove(pipe.id),
    onSuccess: () => { done(); toast("Pipe excluído. Um admin pode restaurar na página inicial.", "success"); navigate("/"); },
    onError,
  });
  const save = (key: keyof typeof form) => {
    const v = form[key].trim();
    const before = key === "name" ? pipe.name : (pipe[key] ?? "");
    if (key === "name" && !v) { setForm((f) => ({ ...f, name: pipe.name })); return; }
    if (v !== before) update.mutate({ pipeId: pipe.id, [key]: key === "name" ? v : v || null });
  };
  const bind = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
    onBlur: () => save(key),
  });
  const { data: calendar } = useQuery({ queryKey: ["calendar"], queryFn: api.calendar.get });
  // A "dia útil" lasts one expediente (e.g. 08:00–18:00 = 600 min).
  const workday = calendar ? (() => { const m = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3)); return m(calendar.endTime) - m(calendar.startTime) || 600; })() : 600;
  const start = phases.find((p) => p.isStart);
  const titleCandidates = fields.filter((f) => f.phaseId === start?.id && TITLE_TYPES.includes(f.type));
  const toggleSubtitle = (id: string, on: boolean) => {
    const next = on ? [...pipe.subtitleFieldIds, id] : pipe.subtitleFieldIds.filter((x) => x !== id);
    if (next.length > 5) { toast("No máximo 5 subtítulos", "error"); return; }
    update.mutate({ pipeId: pipe.id, subtitleFieldIds: next });
  };

  return (
    <section aria-label="Pipe" className="flex flex-col gap-4 rounded-lg border border-border bg-bg p-4">
      <h3 className="text-sm font-semibold text-text">Pipe</h3>
      <div className="grid gap-4 sm:grid-cols-[6rem_minmax(0,1fr)_12rem]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pipe-icon" className="text-sm font-medium text-text">Ícone</label>
          <Input id="pipe-icon" {...bind("icon")} placeholder="📦" maxLength={8} className="text-center text-lg" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pipe-name-edit" className="text-sm font-medium text-text">Nome</label>
          <Input id="pipe-name-edit" {...bind("name")} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pipe-color" className="text-sm font-medium text-text">Cor</label>
          <Select id="pipe-color" value={pipe.color ?? undefined} placeholder="Sem cor" onValueChange={(c) => update.mutate({ pipeId: pipe.id, color: c as PhaseColor })}
            options={PHASE_COLORS.map((c) => ({ value: c, label: COLOR_LABEL[c] }))} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pipe-description" className="text-sm font-medium text-text">Descrição</label>
        <Input id="pipe-description" {...bind("description")} placeholder="Para que serve este processo" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pipe-noun" className="text-sm font-medium text-text">Como os cards se chamam aqui</label>
          <Input id="pipe-noun" {...bind("noun")} placeholder="card (ex.: pedido, candidato, chamado)" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pipe-button" className="text-sm font-medium text-text">Texto do botão de criar</label>
          <Input id="pipe-button" {...bind("createButtonLabel")} placeholder={`Novo ${form.noun || "card"}`} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="pipe-title-field" className="text-sm font-medium text-text">Título do card</label>
        <Select id="pipe-title-field" value={pipe.titleFieldId ?? "__none"}
          onValueChange={(v) => update.mutate({ pipeId: pipe.id, titleFieldId: v === "__none" ? null : v })}
          options={[{ value: "__none", label: "Digitado no formulário (caixa \"Título do card\")" }, ...titleCandidates.map((f) => ({ value: f.id, label: `Campo: ${f.label}` }))]} />
        <p className="text-xs text-muted">Usar um campo do formulário inicial evita digitar o título duas vezes. Vale para cards novos e quando o campo é editado.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="pipe-expiration" className="text-sm font-medium text-text">Prazo total do card</label>
          <DurationInput id="pipe-expiration" value={pipe.expirationMinutes} dayMinutes={pipe.businessHoursOnly ? workday : 1440} dayLabel={pipe.businessHoursOnly ? "dias úteis" : "dias"}
            onChange={(m) => update.mutate({ pipeId: pipe.id, expirationMinutes: m })} />
          <p className="text-xs text-muted">Da criação até uma fase final. Passou disso, o card fica "expirado" (relógio vermelho).</p>
        </div>
        <label className="inline-flex items-start gap-2 pt-7 text-sm text-text">
          <input type="checkbox" className="mt-0.5 h-4 w-4 accent-accent" checked={!!pipe.businessHoursOnly} onChange={(e) => update.mutate({ pipeId: pipe.id, businessHoursOnly: e.target.checked })} />
          <span>Contar prazos só em horário útil <span className="block text-xs text-muted">Usa o expediente e os feriados de Configurações. Vale para o SLA das fases e o prazo total.</span></span>
        </label>
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium text-text">Subtítulos no quadro <span className="text-muted">(até 5 campos exibidos no card fechado)</span></legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {fields.filter((f) => f.type !== "attachment" && f.type !== "id").map((f) => (
            <label key={f.id} className="inline-flex items-center gap-2 text-sm text-text">
              <input type="checkbox" className="h-4 w-4 accent-accent" checked={pipe.subtitleFieldIds.includes(f.id)} onChange={(e) => toggleSubtitle(f.id, e.target.checked)} />
              {f.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="border-t border-border pt-3">
        <Button variant="danger" size="sm" loading={remove.isPending}
          onClick={() => { if (prompt(`Para excluir, digite o nome do pipe: ${pipe.name}`)?.trim() === pipe.name) remove.mutate(); }}>
          <Trash2 className="h-4 w-4" aria-hidden="true" /> Excluir pipe
        </Button>
      </div>
    </section>
  );
}

/** Pipe labels: name + colour. Removing one takes it off every card. */
function LabelsManager({ pipeId }: { pipeId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState("");
  const [color, setColor] = useState<PhaseColor>("blue");
  const { data: labels } = useQuery({ queryKey: ["labels", pipeId], queryFn: () => api.label.listByPipe(pipeId) });
  const done = () => { qc.invalidateQueries({ queryKey: ["labels", pipeId] }); qc.invalidateQueries({ queryKey: ["cards", pipeId] }); };
  const onError = (e: unknown) => toast(errMsg(e), "error");
  const create = useMutation({ mutationFn: () => api.label.create({ pipeId, name: name.trim(), color }), onSuccess: () => { setName(""); done(); }, onError });
  const update = useMutation({ mutationFn: api.label.update, onSuccess: done, onError });
  const remove = useMutation({ mutationFn: api.label.remove, onSuccess: done, onError });
  const colorOptions = PHASE_COLORS.map((c) => ({ value: c, label: COLOR_LABEL[c] }));

  return (
    <section aria-label="Etiquetas" className="flex flex-col gap-3 rounded-lg border border-border bg-bg p-4">
      <div>
        <h3 className="text-sm font-semibold text-text">Etiquetas</h3>
        <p className="text-xs text-muted">Marcadores coloridos que a equipe aplica aos cards (ex.: Urgente, Cliente VIP).</p>
      </div>
      {labels?.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {labels.map((l) => (
            <li key={l.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
              <Tag color={l.color}>{l.name}</Tag>
              <span className="flex-1" />
              <div className="w-40"><Select aria-label={`Cor de ${l.name}`} value={l.color} onValueChange={(c) => update.mutate({ labelId: l.id, color: c as PhaseColor })} options={colorOptions} /></div>
              <button aria-label={`Renomear ${l.name}`} onClick={() => { const n = prompt("Novo nome da etiqueta", l.name)?.trim(); if (n && n !== l.name) update.mutate({ labelId: l.id, name: n }); }} className="rounded p-1 text-muted hover:bg-surface"><Pencil className="h-4 w-4" /></button>
              <button aria-label={`Excluir ${l.name}`} onClick={() => { if (confirm(`Excluir a etiqueta "${l.name}"? Ela sai de todos os cards.`)) remove.mutate(l.id); }} className="rounded p-1 text-muted hover:bg-surface hover:text-danger"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted">Nenhuma etiqueta ainda.</p>}
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(); }}>
        <div className="min-w-48 flex-1"><Input aria-label="Nome da etiqueta" placeholder="Nova etiqueta" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div className="w-40"><Select aria-label="Cor da nova etiqueta" value={color} onValueChange={(c) => setColor(c as PhaseColor)} options={colorOptions} /></div>
        <Button type="submit" disabled={!name.trim()} loading={create.isPending}><Plus className="h-4 w-4" aria-hidden="true" /> Adicionar</Button>
      </form>
    </section>
  );
}

function PhaseEditor({ phase, phases, fields, allFields, businessDay, onChanged }: {
  phase: Phase; phases: Phase[]; fields: FieldDef[]; allFields: FieldDef[]; onChanged: () => void;
  /** Workday length in minutes when the pipe counts business hours ("dias úteis"), else null. */
  businessDay: number | null;
}) {
  const toast = useToast();
  const [name, setName] = useState(phase.name);
  const [description, setDescription] = useState(phase.description ?? "");
  const [editing, setEditing] = useState<FieldDef | "new" | null>(null);
  const onError = (e: unknown) => toast(errMsg(e), "error");

  const update = useMutation({
    mutationFn: (patch: { name?: string; color?: PhaseColor; isEnd?: boolean; description?: string | null; canCreateCard?: boolean; slaMinutes?: number | null }) =>
      api.phase.update({ phaseId: phase.id, ...patch }),
    onSuccess: onChanged,
    onError: (e) => { setName(phase.name); setDescription(phase.description ?? ""); onError(e); },
  });
  const transitions = useMutation({
    mutationFn: (ids: string[]) => api.phase.setTransitions(phase.id, ids),
    onSuccess: onChanged,
    onError,
  });
  const { data: members } = useQuery({ queryKey: ["users"], queryFn: api.user.list });
  const phaseAssignees = useMutation({ mutationFn: (ids: string[]) => api.phase.setAssignees(phase.id, ids), onSuccess: onChanged, onError });
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
  const archiveField = useMutation({
    mutationFn: (p: { id: string; archived: boolean }) => api.field.archive(p.id, p.archived),
    onSuccess: (_d, p) => { onChanged(); toast(p.archived ? "Campo arquivado" : "Campo restaurado", "success"); },
    onError,
  });
  const [showArchived, setShowArchived] = useState(false);
  const active = fields.filter((f) => !f.archivedAt);
  const archived = fields.filter((f) => f.archivedAt);

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

      <div className="flex flex-col gap-1.5">
        <label htmlFor="phase-sla" className="text-sm font-semibold text-text">SLA da fase</label>
        <p className="text-xs text-muted">Tempo máximo que um card pode ficar aqui. Passou disso, ele fica "atrasado" (relógio amarelo e contador na coluna). Vazio = sem limite.</p>
        <DurationInput id="phase-sla" value={phase.slaMinutes} dayMinutes={businessDay ?? 1440} dayLabel={businessDay ? "dias úteis" : "dias"}
          onChange={(m) => update.mutate({ slaMinutes: m })} />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold text-text">Responsáveis da fase</legend>
        <p className="text-xs text-muted">Entram como responsáveis de todo card que chega nesta fase e saem quando ele vai embora.</p>
        <div className="flex flex-wrap gap-2">
          {(members ?? []).map((u) => {
            const on = phase.assigneeIds.includes(u.id);
            return (
              <button key={u.id} type="button" aria-pressed={on} disabled={phaseAssignees.isPending}
                onClick={() => phaseAssignees.mutate(on ? phase.assigneeIds.filter((x) => x !== u.id) : [...phase.assigneeIds, u.id])}
                className={cn("inline-flex items-center gap-1.5 rounded-pill border px-2 py-1 text-sm", on ? "border-accent bg-surface text-text" : "border-border text-muted hover:text-text")}>
                <Avatar name={u.name} color={u.avatarColor} size="sm" /> {u.name}
              </button>
            );
          })}
        </div>
      </fieldset>

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
        {active.length === 0 ? (
          <p className="rounded-md border border-dashed border-border p-4 text-center text-sm text-muted">Nenhum campo. Adicione o que a equipe deve preencher nesta fase.</p>
        ) : (
          <ol className="flex flex-col divide-y divide-border rounded-md border border-border">
            {active.map((f, i) => (
              <li key={f.id} className="flex items-center gap-2 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm text-text">{f.label}{f.required && <span className="ml-1 text-danger" title="Obrigatório">*</span>}</p>
                  <p className="text-xs text-muted">
                    {TYPE_LABEL[f.type] ?? f.type}{f.required ? " · obrigatório" : ""}
                    {f.options?.length ? ` · ${f.options.length} opções` : ""}
                  </p>
                </div>
                <button aria-label={`Subir ${f.label}`} disabled={i === 0 || reorderFields.isPending} onClick={() => reorderFields.mutate(moved(active, i, -1))} className="rounded p-1 text-muted hover:bg-surface disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
                <button aria-label={`Descer ${f.label}`} disabled={i === active.length - 1 || reorderFields.isPending} onClick={() => reorderFields.mutate(moved(active, i, 1))} className="rounded p-1 text-muted hover:bg-surface disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
                <button aria-label={`Editar ${f.label}`} onClick={() => setEditing(f)} className="rounded p-1 text-muted hover:bg-surface"><Pencil className="h-4 w-4" /></button>
                <button aria-label={`Arquivar ${f.label}`} title="Arquivar (some dos formulários, mantém os valores)" onClick={() => archiveField.mutate({ id: f.id, archived: true })} className="rounded p-1 text-muted hover:bg-surface"><Archive className="h-4 w-4" /></button>
                <button aria-label={`Excluir ${f.label}`} onClick={() => { if (confirm(`Excluir o campo "${f.label}"? Os valores preenchidos nos cards serão apagados. Prefira arquivar se quiser guardar os dados.`)) removeField.mutate(f.id); }} className="rounded p-1 text-muted hover:bg-surface hover:text-danger"><Trash2 className="h-4 w-4" /></button>
              </li>
            ))}
          </ol>
        )}
        {archived.length > 0 && (
          <div className="flex flex-col gap-1">
            <button className="self-start text-xs text-accent" onClick={() => setShowArchived((s) => !s)}>
              {showArchived ? "Ocultar" : "Mostrar"} campos arquivados ({archived.length})
            </button>
            {showArchived && (
              <ul className="flex flex-col divide-y divide-border rounded-md border border-dashed border-border">
                {archived.map((f) => (
                  <li key={f.id} className="flex items-center gap-2 px-3 py-2">
                    <span className="min-w-0 flex-1 truncate text-sm text-muted">{f.label} · {TYPE_LABEL[f.type] ?? f.type}</span>
                    <Button size="sm" variant="secondary" onClick={() => archiveField.mutate({ id: f.id, archived: false })}>
                      <ArchiveRestore className="h-4 w-4" aria-hidden="true" /> Restaurar
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>

      <ConditionsSection phase={phase} phases={phases} fields={allFields} />

      <div className="border-t border-border pt-4">
        <Button variant="danger" size="sm" disabled={phase.isStart} loading={remove.isPending}
          title={phase.isStart ? "Defina outra fase como inicial antes" : undefined}
          onClick={() => { if (confirm(`Excluir a fase "${phase.name}" e os campos dela?`)) remove.mutate(); }}>
          <Trash2 className="h-4 w-4" aria-hidden="true" /> Excluir fase
        </Button>
      </div>

      <FieldEditorModal field={editing} onClose={() => setEditing(null)} onSaved={onChanged} pipeFields={allFields}
        save={(d, existing) => existing
          ? api.field.update({ fieldId: existing.id, label: d.label, required: d.required, options: d.options, description: d.description, help: d.help, editableOtherPhases: d.editableOtherPhases, isUnique: d.isUnique, validationRegex: d.validationRegex,
              settings: d.settings ? { canSearch: d.settings.canSearch, canCreate: d.settings.canCreate, multiple: d.settings.multiple, fieldMap: d.settings.fieldMap, requireChild: d.settings.requireChild, requireChildrenDone: d.settings.requireChildrenDone } : undefined })
          : api.field.create({ phaseId: phase.id, ...d, options: d.options ?? undefined, settings: d.settings ?? undefined })} />
    </section>
  );
}
