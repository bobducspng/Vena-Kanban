import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, History, Pencil, Play, Plus, Trash2, X, Zap } from "lucide-react";
import { api } from "../data/store";
import type { AutomationAction, AutomationLog, AutomationRule, AutomationTrigger, FieldDef, Phase } from "../data/types";
import type { Rule } from "../lib/conditions";
import { useMe } from "../lib/useMe";
import { cn } from "../lib/cn";
import { AppShell } from "../components/app/AppShell";
import { RuleRow, emptyRule } from "../components/app/ConditionsEditor";
import { Avatar } from "../components/ui/Avatar";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado");
const TRIGGER_LABEL: Record<AutomationTrigger["type"], string> = {
  card_created: "Card criado",
  card_entered_phase: "Card entrou na fase",
  card_left_phase: "Card saiu da fase",
  field_updated: "Campo atualizado",
  scheduled: "Agendado (de tempos em tempos)",
  children_in_phase: "Todos os cards filhos chegaram numa fase",
  alert: "Alerta de prazo (atrasado, expirado ou vencido)",
};
const ALERT_LABEL = { late: "Atrasado na fase", expired: "Expirado (prazo do pipe)", overdue: "Vencido (data de vencimento)" } as const;
const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const FREQ_LABEL = { hourly: "de hora em hora", daily: "todo dia", weekly: "toda semana" } as const;
const ACTION_LABEL: Record<AutomationAction["type"], string> = {
  move_card: "Mover card",
  update_field: "Atualizar campo",
  assign: "Definir responsável",
  create_connected_card: "Criar card conectado (outro pipe)",
  move_parent: "Mover o card pai",
  formula: "Calcular fórmula",
  http: "Chamar outro sistema (HTTP)",
};
const NOT_WRITABLE = ["connection", "attachment", "id"];

/** S12 — automations of a pipe: rules list (status of the last run), builder, log, test. */
export function PipeAutomations() {
  const { pipeId = "" } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const { me, isAdmin } = useMe();
  const [editing, setEditing] = useState<AutomationRule | "new" | null>(null);
  const [logsOf, setLogsOf] = useState<AutomationRule | null>(null);
  const [testOf, setTestOf] = useState<AutomationRule | null>(null);

  const { data: pipe } = useQuery({ queryKey: ["pipe", pipeId], queryFn: () => api.pipe.get(pipeId) });
  const { data: rules, isLoading } = useQuery({ queryKey: ["automations", pipeId], queryFn: () => api.automation.list(pipeId), enabled: isAdmin });
  const { data: phases } = useQuery({ queryKey: ["phases", pipeId], queryFn: () => api.phase.listByPipe(pipeId) });
  const { data: fields } = useQuery({ queryKey: ["fields", pipeId], queryFn: () => api.field.listByPipe(pipeId) });
  const done = () => qc.invalidateQueries({ queryKey: ["automations", pipeId] });
  const onError = (e: unknown) => toast(errMsg(e), "error");
  const setActive = useMutation({ mutationFn: (p: { id: string; active: boolean }) => api.automation.setActive(p.id, p.active), onSuccess: done, onError });
  const duplicate = useMutation({ mutationFn: api.automation.duplicate, onSuccess: () => { done(); toast("Cópia criada (desativada)", "success"); }, onError });
  const remove = useMutation({ mutationFn: api.automation.remove, onSuccess: done, onError });

  if (me && !isAdmin) {
    return <AppShell title="Automações"><p className="p-6 text-sm text-muted">Só administradores configuram automações.</p></AppShell>;
  }
  const phaseName = (id?: string) => phases?.find((p) => p.id === id)?.name ?? "?";
  const fieldName = (id?: string) => fields?.find((f) => f.id === id)?.label ?? "qualquer campo";
  const when = (t: AutomationTrigger) =>
    t.type === "field_updated" ? `${TRIGGER_LABEL[t.type]}: ${fieldName(t.fieldId)}`
      : t.type === "scheduled" ? `Agendado ${FREQ_LABEL[t.frequency ?? "daily"]}${t.time ? ` às ${t.time}` : ""}${t.frequency === "weekly" ? ` (${(t.weekdays ?? []).map((d) => WEEKDAYS[d]).join(", ")})` : ""}`
      : t.type === "children_in_phase" ? "Todos os filhos chegaram na fase escolhida"
      : t.type === "alert" ? `Alerta: ${t.alertKind ? ALERT_LABEL[t.alertKind] : "qualquer"}${t.phaseId ? ` em ${phaseName(t.phaseId)}` : ""}`
      : t.phaseId ? `${TRIGGER_LABEL[t.type]}: ${phaseName(t.phaseId)}` : TRIGGER_LABEL[t.type];

  return (
    <AppShell title={pipe ? `${pipe.name} · Automações` : "Automações"}>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <Link to={`/pipes/${pipeId}`} className="text-xs text-muted hover:text-accent">← Voltar ao quadro</Link>
            <h2 className="text-lg text-text">Automações</h2>
            <p className="text-sm text-muted">Quando algo acontece com um card, e as condições batem, o Fluxos executa as ações. Sem limite de uso; cada execução fica registrada.</p>
          </div>
          <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" aria-hidden="true" /> Nova automação</Button>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" label="Carregando" /> Carregando…</div>
        ) : !rules?.length ? (
          <div className="rounded-lg border border-dashed border-border-input p-10 text-center">
            <Zap className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-text">Nenhuma automação ainda</p>
            <p className="mt-1 text-sm text-muted">Ex.: quando o card entrar em "Aprovação", definir o gestor como responsável.</p>
          </div>
        ) : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
            {rules.map((r) => (
              <li key={r.id} className={cn("flex flex-wrap items-center gap-3 px-4 py-3", !r.active && "opacity-60")}>
                <label className="inline-flex items-center gap-2" title={r.active ? "Ativa" : "Desativada"}>
                  <input type="checkbox" className="h-4 w-4 accent-accent" checked={r.active} aria-label={`Ativar ${r.name}`}
                    onChange={(e) => setActive.mutate({ id: r.id, active: e.target.checked })} />
                </label>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-text">{r.name}</p>
                  <p className="truncate text-xs text-muted">
                    {when(r.trigger)}{r.groups.length ? " · com condições" : ""} → {r.actions.map((a) => ACTION_LABEL[a.type]).join(", ")}
                  </p>
                  {r.lastStatus === "failed" && <p className="truncate text-xs text-danger" title={r.lastError ?? ""}>Última execução falhou: {r.lastError}</p>}
                  {r.lastStatus === "success" && r.lastRunAt && <p className="text-xs text-success">Última execução ok · {new Date(r.lastRunAt).toLocaleString("pt-BR")}</p>}
                </div>
                <div className="flex items-center gap-1">
                  <button aria-label={`Registro de ${r.name}`} title="Registro de execuções" onClick={() => setLogsOf(r)} className="rounded p-1.5 text-muted hover:bg-surface"><History className="h-4 w-4" /></button>
                  <button aria-label={`Testar ${r.name}`} title="Testar num card" onClick={() => setTestOf(r)} className="rounded p-1.5 text-muted hover:bg-surface"><Play className="h-4 w-4" /></button>
                  <button aria-label={`Editar ${r.name}`} onClick={() => setEditing(r)} className="rounded p-1.5 text-muted hover:bg-surface"><Pencil className="h-4 w-4" /></button>
                  <button aria-label={`Duplicar ${r.name}`} onClick={() => duplicate.mutate(r.id)} className="rounded p-1.5 text-muted hover:bg-surface"><Copy className="h-4 w-4" /></button>
                  <button aria-label={`Excluir ${r.name}`} onClick={() => { if (confirm(`Excluir a automação "${r.name}" e o registro dela?`)) remove.mutate(r.id); }} className="rounded p-1.5 text-muted hover:bg-surface hover:text-danger"><Trash2 className="h-4 w-4" /></button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {phases && fields && <RuleModal pipeId={pipeId} phases={phases} fields={fields} editing={editing} onClose={() => setEditing(null)} onSaved={done} />}
      <LogsModal rule={logsOf} onClose={() => setLogsOf(null)} />
      <TestModal rule={testOf} onClose={() => { setTestOf(null); done(); }} />
    </AppShell>
  );
}

function RuleModal({ pipeId, phases, fields, editing, onClose, onSaved }: {
  pipeId: string; phases: Phase[]; fields: FieldDef[]; editing: AutomationRule | "new" | null; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const existing = editing && editing !== "new" ? editing : null;
  const [name, setName] = useState("");
  const [trig, setTrig] = useState<AutomationTrigger>({ type: "card_entered_phase" });
  const [groups, setGroups] = useState<Rule[][]>([]);
  const [actions, setActions] = useState<AutomationAction[]>([]);
  const sources = fields.filter((f) => f.type !== "id");

  useEffect(() => {
    if (!editing) return;
    setName(existing?.name ?? "");
    setTrig(existing?.trigger ?? { type: "card_entered_phase", phaseId: phases[0]?.id });
    setGroups((existing?.groups as Rule[][] | undefined) ?? []);
    setActions(existing?.actions ?? [{ type: "move_card", phaseId: phases[0]?.id ?? "" }]);
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: async (): Promise<unknown> => {
      const body = { name: name.trim(), trigger: trig, groups, actions };
      return existing ? api.automation.update({ ruleId: existing.id, ...body }) : api.automation.create({ pipeId, ...body });
    },
    onSuccess: () => { onSaved(); toast(existing ? "Automação salva" : "Automação criada", "success"); onClose(); },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const setRule = (gi: number, ri: number, patch: Partial<Rule>) =>
    setGroups((gs) => gs.map((g, i) => (i !== gi ? g : g.map((r, j) => (j === ri ? { ...r, ...patch } : r)))));
  const needsPhase = trig.type === "card_entered_phase" || trig.type === "card_left_phase";

  return (
    <Modal open={!!editing} onOpenChange={(o) => !o && onClose()} title={existing ? "Editar automação" : "Nova automação"} size="wide"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => save.mutate()} loading={save.isPending}
          disabled={!name.trim() || !actions.length || (needsPhase && !trig.phaseId) || (trig.type === "children_in_phase" && !trig.phaseId) || (trig.type === "scheduled" && trig.frequency === "weekly" && !trig.weekdays?.length)}>Salvar</Button></>}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="auto-name" className="text-sm font-medium text-text">Nome</label>
          <Input id="auto-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Atribuir aprovador ao entrar em Aprovação" />
        </div>

        <section aria-label="Quando" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-text">Quando</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            <Select aria-label="Gatilho" value={trig.type}
              onValueChange={(v) => setTrig(v === "scheduled" ? { type: "scheduled", frequency: "daily", time: "08:00", weekdays: [1, 2, 3, 4, 5] }
                : { type: v as AutomationTrigger["type"], phaseId: v === "card_entered_phase" || v === "card_left_phase" ? phases[0]?.id : undefined })}
              options={(Object.keys(TRIGGER_LABEL) as AutomationTrigger["type"][]).map((t) => ({ value: t, label: TRIGGER_LABEL[t] }))} />
            {needsPhase && (
              <Select aria-label="Fase" value={trig.phaseId} placeholder="Fase" onValueChange={(v) => setTrig((t) => ({ ...t, phaseId: v }))}
                options={phases.map((p) => ({ value: p.id, label: p.name }))} />
            )}
            {trig.type === "scheduled" && (
              <Select aria-label="Frequência" value={trig.frequency} onValueChange={(v) => setTrig((t) => ({ ...t, frequency: v as "daily" }))}
                options={(Object.keys(FREQ_LABEL) as (keyof typeof FREQ_LABEL)[]).map((k) => ({ value: k, label: FREQ_LABEL[k] }))} />
            )}
            {trig.type === "alert" && (
              <Select aria-label="Qual alerta" value={trig.alertKind ?? "__any"} onValueChange={(v) => setTrig((t) => ({ ...t, alertKind: v === "__any" ? undefined : v as "late" }))}
                options={[{ value: "__any", label: "Qualquer alerta" }, ...(Object.keys(ALERT_LABEL) as (keyof typeof ALERT_LABEL)[]).map((k) => ({ value: k, label: ALERT_LABEL[k] }))]} />
            )}
            {trig.type === "alert" && (
              <Select aria-label="Em qual fase" value={trig.phaseId ?? "__all"} onValueChange={(v) => setTrig((t) => ({ ...t, phaseId: v === "__all" ? undefined : v }))}
                options={[{ value: "__all", label: "Em qualquer fase" }, ...phases.map((p) => ({ value: p.id, label: `Só em ${p.name}` }))]} />
            )}
            {trig.type === "children_in_phase" && <ChildPhasePicker value={trig.phaseId} onChange={(id) => setTrig((t) => ({ ...t, phaseId: id }))} />}
            {trig.type === "field_updated" && (
              <Select aria-label="Campo" value={trig.fieldId ?? "__any"} onValueChange={(v) => setTrig((t) => ({ ...t, fieldId: v === "__any" ? undefined : v }))}
                options={[{ value: "__any", label: "Qualquer campo" }, ...sources.map((f) => ({ value: f.id, label: f.label }))]} />
            )}
          </div>
          {trig.type === "scheduled" && (
            <div className="flex flex-col gap-2 rounded-md border border-border p-3">
              {trig.frequency !== "hourly" && (
                <label className="flex items-center gap-2 text-sm text-text">Horário (Brasília)
                  <Input type="time" aria-label="Horário" value={trig.time ?? ""} onChange={(e) => setTrig((t) => ({ ...t, time: e.target.value }))} className="w-32" />
                </label>
              )}
              {trig.frequency === "weekly" && (
                <div className="flex flex-wrap gap-2">
                  {WEEKDAYS.map((d, i) => {
                    const on = (trig.weekdays ?? []).includes(i);
                    return (
                      <button key={d} type="button" aria-pressed={on}
                        onClick={() => setTrig((t) => ({ ...t, weekdays: on ? (t.weekdays ?? []).filter((x) => x !== i) : [...(t.weekdays ?? []), i].sort() }))}
                        className={cn("rounded-pill border px-3 py-1 text-sm", on ? "border-accent bg-surface text-text" : "border-border text-muted")}>{d}</button>
                    );
                  })}
                </div>
              )}
              <Select aria-label="Cards de qual fase" value={trig.phaseId ?? "__all"} onValueChange={(v) => setTrig((t) => ({ ...t, phaseId: v === "__all" ? undefined : v }))}
                options={[{ value: "__all", label: "Cards de todas as fases" }, ...phases.map((p) => ({ value: p.id, label: `Só cards em ${p.name}` }))]} />
              <p className="text-xs text-muted">A cada execução, a regra passa pelos cards (até 300) e age nos que atendem às condições abaixo. Ex.: todo dia às 08:00, cards vencidos → mover para "Atrasados".</p>
            </div>
          )}
          {trig.type === "children_in_phase" && (
            <p className="text-xs text-muted">Dispara no card pai quando o último dos filhos conectados (do pipe da fase escolhida) chega nela. Ex.: todos os pagamentos concluídos → mover a compra para Concluído.</p>
          )}
        </section>

        <section aria-label="Se" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-text">Se <span className="font-normal text-muted">(opcional; sem condições, sempre executa)</span></h3>
          {groups.map((g, gi) => (
            <div key={gi} className="flex flex-col gap-2">
              {gi > 0 && <p className="text-xs font-semibold uppercase tracking-wide text-accent">ou</p>}
              <div className="flex flex-col gap-2 rounded-md border border-border p-3">
                {g.map((r, ri) => (
                  <div key={ri} className="flex flex-col gap-1">
                    {ri > 0 && <p className="text-xs font-semibold uppercase tracking-wide text-muted">e</p>}
                    <RuleRow rule={r} sources={sources} onChange={(p) => setRule(gi, ri, p)}
                      onRemove={() => setGroups((gs) => gs.map((x, i) => (i === gi ? x.filter((_, j) => j !== ri) : x)).filter((x) => x.length > 0))} />
                  </div>
                ))}
                <Button size="sm" variant="ghost" className="self-start" onClick={() => setGroups((gs) => gs.map((x, i) => (i === gi ? [...x, emptyRule(sources[0])] : x)))}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> E
                </Button>
              </div>
            </div>
          ))}
          <Button size="sm" variant="secondary" className="self-start" onClick={() => setGroups((gs) => [...gs, [emptyRule(sources[0])]])}>
            <Plus className="h-4 w-4" aria-hidden="true" /> {groups.length ? "OU (novo grupo)" : "Adicionar condição"}
          </Button>
        </section>

        <section aria-label="Então" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-text">Então <span className="font-normal text-muted">(em ordem; se uma ação falha, as seguintes não rodam)</span></h3>
          {actions.map((a, i) => (
            <ActionEditor key={i} index={i} action={a} phases={phases} fields={fields}
              onChange={(next) => setActions((as) => as.map((x, j) => (j === i ? next : x)))}
              onRemove={() => setActions((as) => as.filter((_, j) => j !== i))} />
          ))}
          <Button size="sm" variant="secondary" className="self-start" onClick={() => setActions((as) => [...as, { type: "move_card", phaseId: phases[0]?.id ?? "" }])}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar ação
          </Button>
        </section>
      </div>
    </Modal>
  );
}

/** Default shape when the action type changes. */
function blank(type: AutomationAction["type"], phases: Phase[]): AutomationAction {
  switch (type) {
    case "move_card": return { type, phaseId: phases[0]?.id ?? "" };
    case "update_field": return { type, fieldId: "", mode: "fixed", value: null };
    case "assign": return { type, mode: "round_robin", userIds: [] };
    case "create_connected_card": return { type, connectionFieldId: "", values: [] };
    case "move_parent": return { type, phaseId: "" };
    case "formula": return { type, fieldId: "", expression: "" };
    case "http": return { type, method: "POST", url: "https://", headers: [{ name: "Content-Type", value: "application/json" }], body: "" };
  }
}

/** Phase of another pipe (the children's pipe), picked pipe first. */
function ChildPhasePicker({ value, onChange }: { value?: string; onChange: (phaseId: string) => void }) {
  const { data: pipes } = useQuery({ queryKey: ["pipes"], queryFn: api.pipe.list });
  const [pipeId, setPipeId] = useState("");
  const { data: phases } = useQuery({ queryKey: ["phases", pipeId], queryFn: () => api.phase.listByPipe(pipeId), enabled: !!pipeId });
  return (
    <div className="grid gap-2 sm:col-span-2 sm:grid-cols-2">
      <Select aria-label="Pipe dos filhos" value={pipeId || undefined} placeholder="Pipe dos filhos" onValueChange={setPipeId}
        options={(pipes ?? []).map((p) => ({ value: p.id, label: p.name }))} />
      <Select aria-label="Fase dos filhos" value={value} placeholder={value && !pipeId ? "(fase escolhida)" : "Fase"} onValueChange={onChange}
        options={(phases ?? []).map((p) => ({ value: p.id, label: p.name }))} />
    </div>
  );
}

function ActionEditor({ index, action, phases, fields, onChange, onRemove }: {
  index: number; action: AutomationAction; phases: Phase[]; fields: FieldDef[]; onChange: (a: AutomationAction) => void; onRemove: () => void;
}) {
  const { data: members } = useQuery({ queryKey: ["users"], queryFn: api.user.list, enabled: action.type === "assign" });
  const { data: pipes } = useQuery({ queryKey: ["pipes"], queryFn: api.pipe.list, enabled: action.type === "move_parent" || action.type === "create_connected_card" });
  const [parentPipe, setParentPipe] = useState("");
  const { data: parentPhases } = useQuery({ queryKey: ["phases", parentPipe], queryFn: () => api.phase.listByPipe(parentPipe), enabled: action.type === "move_parent" && !!parentPipe });
  const conn = action.type === "create_connected_card" ? fields.find((f) => f.id === action.connectionFieldId) : undefined;
  const { data: targetFields } = useQuery({
    queryKey: ["fields", conn?.settings?.targetId],
    queryFn: () => api.field.listByPipe(conn!.settings!.targetId),
    enabled: !!conn?.settings && conn.settings.target === "pipe",
  });
  const writable = fields.filter((f) => !NOT_WRITABLE.includes(f.type));
  const pipeConnections = fields.filter((f) => f.type === "connection" && f.settings?.target === "pipe");

  return (
    <div className="flex flex-col gap-2 rounded-md border border-border p-3">
      <div className="flex items-center gap-2">
        <span className="text-xs font-semibold text-muted">{index + 1}.</span>
        <div className="flex-1">
          <Select aria-label="Tipo de ação" value={action.type} onValueChange={(t) => onChange(blank(t as AutomationAction["type"], phases))}
            options={(Object.keys(ACTION_LABEL) as AutomationAction["type"][]).map((t) => ({ value: t, label: ACTION_LABEL[t] }))} />
        </div>
        <button aria-label="Remover ação" onClick={onRemove} className="rounded p-1 text-muted hover:text-danger"><X className="h-4 w-4" /></button>
      </div>

      {action.type === "move_card" && (
        <Select aria-label="Para a fase" value={action.phaseId || undefined} placeholder="Para a fase" onValueChange={(v) => onChange({ ...action, phaseId: v })}
          options={phases.map((p) => ({ value: p.id, label: p.name }))} />
      )}

      {action.type === "update_field" && (() => {
        const target = writable.find((f) => f.id === action.fieldId);
        const dates = fields.filter((f) => ["date", "due_date"].includes(f.type));
        return (
          <div className="flex flex-col gap-2">
            <div className="grid gap-2 sm:grid-cols-2">
              <Select aria-label="Campo" value={action.fieldId || undefined} placeholder="Campo a atualizar" onValueChange={(v) => onChange({ ...action, fieldId: v, value: null })}
                options={writable.map((f) => ({ value: f.id, label: f.label }))} />
              <Select aria-label="Como" value={action.mode} onValueChange={(v) => onChange({ ...action, mode: v as "fixed", value: null, fromFieldId: undefined, days: v === "date_offset" ? 0 : undefined })}
                options={[
                  { value: "fixed", label: "Valor fixo" },
                  { value: "copy", label: "Copiar de outro campo" },
                  ...(target && ["date", "due_date"].includes(target.type) ? [{ value: "date_offset", label: "Data relativa (N dias)" }] : []),
                  { value: "clear", label: "Limpar" },
                ]} />
            </div>
            {action.mode === "fixed" && target && (
              <Field def={{ ...target, required: false, description: null, help: null, label: "Valor" }} value={action.value ?? undefined} onChange={(v) => onChange({ ...action, value: v })} />
            )}
            {action.mode === "copy" && (
              <Select aria-label="Copiar de" value={action.fromFieldId} placeholder="Copiar de" onValueChange={(v) => onChange({ ...action, fromFieldId: v })}
                options={fields.filter((f) => f.id !== action.fieldId && f.type !== "id").map((f) => ({ value: f.id, label: f.label }))} />
            )}
            {action.mode === "date_offset" && (
              <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)] sm:items-center">
                <Input aria-label="Dias" type="number" value={action.days ?? 0} onChange={(e) => onChange({ ...action, days: Number(e.target.value) })} />
                <Select aria-label="A partir de" value={action.fromFieldId ?? "__today"} onValueChange={(v) => onChange({ ...action, fromFieldId: v === "__today" ? undefined : v })}
                  options={[{ value: "__today", label: "dias a partir de hoje" }, ...dates.map((f) => ({ value: f.id, label: `dias a partir de "${f.label}"` }))]} />
              </div>
            )}
          </div>
        );
      })()}

      {action.type === "assign" && (
        <div className="flex flex-col gap-2">
          <Select aria-label="Modo" value={action.mode} onValueChange={(v) => onChange({ ...action, mode: v as "round_robin" })}
            options={[{ value: "round_robin", label: "Rodízio (um de cada vez)" }, { value: "random", label: "Aleatório" }, { value: "set", label: "Todos os escolhidos" }]} />
          <div className="flex flex-wrap gap-2">
            {(members ?? []).map((u) => {
              const on = action.userIds.includes(u.id);
              return (
                <button key={u.id} type="button" aria-pressed={on}
                  onClick={() => onChange({ ...action, userIds: on ? action.userIds.filter((x) => x !== u.id) : [...action.userIds, u.id] })}
                  className={cn("inline-flex items-center gap-1.5 rounded-pill border px-2 py-1 text-sm", on ? "border-accent bg-surface text-text" : "border-border text-muted")}>
                  <Avatar name={u.name} color={u.avatarColor} size="sm" /> {u.name}
                </button>
              );
            })}
          </div>
          <p className="text-xs text-muted">Substitui os responsáveis do card.</p>
        </div>
      )}

      {action.type === "create_connected_card" && (
        <div className="flex flex-col gap-2">
          {pipeConnections.length === 0 ? (
            <p className="text-xs text-muted">Crie antes, em Configurar, um campo de Conexão com outro pipe.</p>
          ) : (
            <Select aria-label="Pelo campo de conexão" value={action.connectionFieldId || undefined} placeholder="Campo de conexão (com outro pipe)"
              onValueChange={(v) => onChange({ ...action, connectionFieldId: v, values: [] })}
              options={pipeConnections.map((f) => ({ value: f.id, label: `${f.label} → ${pipes?.find((p) => p.id === f.settings?.targetId)?.name ?? "pipe"}` }))} />
          )}
          {conn && (
            <>
              <p className="text-xs text-muted">Preencher no card novo (formulário inicial do outro pipe):</p>
              {action.values.map((m, j) => (
                <div key={j} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto] sm:items-center">
                  <Select aria-label="Campo do card novo" value={m.toFieldId || undefined} placeholder="Campo do card novo"
                    onValueChange={(v) => onChange({ ...action, values: action.values.map((x, k) => (k === j ? { ...x, toFieldId: v } : x)) })}
                    options={(targetFields ?? []).filter((f) => !NOT_WRITABLE.includes(f.type)).map((f) => ({ value: f.id, label: f.label }))} />
                  <span className="text-center text-xs text-muted">←</span>
                  <Select aria-label="Valor vindo de" value={m.fromFieldId || undefined} placeholder="Campo deste card"
                    onValueChange={(v) => onChange({ ...action, values: action.values.map((x, k) => (k === j ? { ...x, fromFieldId: v } : x)) })}
                    options={fields.filter((f) => f.type !== "id").map((f) => ({ value: f.id, label: f.label }))} />
                  <button aria-label="Remover" onClick={() => onChange({ ...action, values: action.values.filter((_, k) => k !== j) })} className="rounded p-1 text-muted hover:text-danger"><X className="h-4 w-4" /></button>
                </div>
              ))}
              <Button size="sm" variant="ghost" className="self-start" onClick={() => onChange({ ...action, values: [...action.values, { toFieldId: "", fromFieldId: "" }] })}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Preencher campo
              </Button>
            </>
          )}
        </div>
      )}

      {action.type === "formula" && (
        <div className="flex flex-col gap-2">
          <Select aria-label="Gravar o resultado em" value={action.fieldId || undefined} placeholder="Gravar o resultado em"
            onValueChange={(v) => onChange({ ...action, fieldId: v })}
            options={fields.filter((f) => ["number", "currency", "date", "due_date", "checkbox", "short_text", "long_text"].includes(f.type)).map((f) => ({ value: f.id, label: f.label }))} />
          <Input aria-label="Fórmula" className="font-mono" placeholder="Ex.: ROUND({Valor} * 1.1, 2)" value={action.expression} onChange={(e) => onChange({ ...action, expression: e.target.value })} />
          <div className="flex flex-wrap gap-1">
            {fields.filter((f) => !["attachment", "id", "connection"].includes(f.type)).map((f) => (
              <button key={f.id} type="button" onClick={() => onChange({ ...action, expression: `${action.expression}{${f.label}}` })}
                className="rounded-pill border border-border px-2 py-0.5 text-xs text-muted hover:text-text">{`{${f.label}}`}</button>
            ))}
          </div>
          <p className="text-xs text-muted">Operadores + - * / % ^ e parênteses; funções SUM, AVERAGE, MIN, MAX, ROUND(x, casas), IF_NULL(x, padrão), ABS, COUNT, TODAY(). Datas: data + 30 = data; data − data = dias. Decimal com ponto (1.5).</p>
        </div>
      )}

      {action.type === "http" && (
        <div className="flex flex-col gap-2">
          <div className="grid gap-2 sm:grid-cols-[8rem_minmax(0,1fr)]">
            <Select aria-label="Método" value={action.method} onValueChange={(v) => onChange({ ...action, method: v as "POST" })}
              options={["GET", "POST", "PUT", "PATCH", "DELETE"].map((m) => ({ value: m, label: m }))} />
            <Input aria-label="URL" className="font-mono" value={action.url} onChange={(e) => onChange({ ...action, url: e.target.value })} placeholder="https://api.exemplo.com/pedidos/{#}" />
          </div>
          {action.headers.map((h, j) => (
            <div key={j} className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,2fr)_auto]">
              <Input aria-label="Cabeçalho" value={h.name} placeholder="Authorization" onChange={(e) => onChange({ ...action, headers: action.headers.map((x, k) => (k === j ? { ...x, name: e.target.value } : x)) })} />
              <Input aria-label="Valor do cabeçalho" value={h.value} placeholder="Bearer ..." onChange={(e) => onChange({ ...action, headers: action.headers.map((x, k) => (k === j ? { ...x, value: e.target.value } : x)) })} />
              <button aria-label="Remover cabeçalho" onClick={() => onChange({ ...action, headers: action.headers.filter((_, k) => k !== j) })} className="rounded p-1 text-muted hover:text-danger"><X className="h-4 w-4" /></button>
            </div>
          ))}
          <Button size="sm" variant="ghost" className="self-start" onClick={() => onChange({ ...action, headers: [...action.headers, { name: "", value: "" }] })}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Cabeçalho
          </Button>
          {action.method !== "GET" && action.method !== "DELETE" && (
            <textarea aria-label="Corpo" rows={5} className="w-full rounded-md border border-border-input bg-bg p-2 font-mono text-xs text-text"
              placeholder={'{ "pedido": "{#}", "valor": "{Valor}" }'} value={action.body ?? ""} onChange={(e) => onChange({ ...action, body: e.target.value })} />
          )}
          <Select aria-label="Guardar a resposta em" value={action.saveToFieldId ?? "__none"} onValueChange={(v) => onChange({ ...action, saveToFieldId: v === "__none" ? undefined : v })}
            options={[{ value: "__none", label: "Não guardar a resposta" }, ...fields.filter((f) => ["short_text", "long_text"].includes(f.type)).map((f) => ({ value: f.id, label: `Guardar a resposta em "${f.label}"` }))]} />
          <p className="text-xs text-muted">{"Use {Nome do campo}, {#} (número do card) e {Título}. Resposta fora de 2xx conta como falha. Endereços internos da rede são bloqueados por segurança."}</p>
        </div>
      )}

      {action.type === "move_parent" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <Select aria-label="Pipe do card pai" value={parentPipe || undefined} placeholder="Pipe do card pai" onValueChange={(v) => { setParentPipe(v); onChange({ ...action, phaseId: "" }); }}
            options={(pipes ?? []).map((p) => ({ value: p.id, label: p.name }))} />
          <Select aria-label="Mover o pai para" value={action.phaseId || undefined} placeholder={action.phaseId && !parentPipe ? "(fase escolhida)" : "Fase"} onValueChange={(v) => onChange({ ...action, phaseId: v })}
            options={(parentPhases ?? []).map((p) => ({ value: p.id, label: p.name }))} />
        </div>
      )}
    </div>
  );
}

function LogsModal({ rule, onClose }: { rule: AutomationRule | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({ queryKey: ["automationLogs", rule?.id], queryFn: () => api.automation.logs(rule!.id), enabled: !!rule });
  const badge = (s: AutomationLog["status"]) =>
    s === "success" ? <span className="text-success">ok</span> : s === "failed" ? <span className="text-danger">falhou</span> : <span className="text-muted">não se aplicou</span>;
  return (
    <Modal open={!!rule} onOpenChange={(o) => !o && onClose()} title={`Registro · ${rule?.name ?? ""}`} description="Últimas 100 execuções (guardadas por 90 dias).">
      {isLoading ? <Spinner className="h-4 w-4" label="Carregando" /> : !data?.length ? <p className="text-sm text-muted">Ainda não executou.</p> : (
        <ul className="flex flex-col divide-y divide-border">
          {data.map((l) => (
            <li key={l.id} className="flex flex-col gap-0.5 py-2 text-sm">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium">{badge(l.status)}</span>
                <span className="text-xs text-muted">{new Date(l.createdAt).toLocaleString("pt-BR")}</span>
                {l.card && <span className="truncate text-xs text-text">#{l.card.number} · {l.card.title}</span>}
              </div>
              {l.message && <p className={cn("text-xs", l.status === "failed" ? "text-danger" : "text-muted")}>{l.message}</p>}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/** "Testar regra" on a card by number: dry run (changes nothing) or run now. */
function TestModal({ rule, onClose }: { rule: AutomationRule | null; onClose: () => void }) {
  const [num, setNum] = useState("");
  const [result, setResult] = useState<{ status: string; message: string } | null>(null);
  useEffect(() => { setNum(""); setResult(null); }, [rule]);
  const test = useMutation({
    mutationFn: (execute: boolean) => api.automation.test(rule!.id, Number(num.replace("#", "")), execute),
    onSuccess: setResult,
    onError: (e) => setResult({ status: "failed", message: errMsg(e) }),
  });
  return (
    <Modal open={!!rule} onOpenChange={(o) => !o && onClose()} title={`Testar · ${rule?.name ?? ""}`}
      description="Informe o número de um card deste pipe. 'Testar' só verifica as condições; 'Executar agora' roda as ações de verdade nesse card."
      footer={<><Button variant="secondary" disabled={!num || test.isPending} onClick={() => test.mutate(false)}>Testar</Button>
        <Button disabled={!num || test.isPending} onClick={() => { if (confirm("Executar as ações de verdade neste card?")) test.mutate(true); }}>Executar agora</Button></>}>
      <div className="flex flex-col gap-3">
        <Input aria-label="Número do card" placeholder="#123" value={num} onChange={(e) => setNum(e.target.value)} inputMode="numeric" />
        {result && (
          <p className={cn("rounded-md border p-3 text-sm", result.status === "failed" ? "border-danger text-danger" : result.status === "skipped" ? "border-border text-muted" : "border-success text-success")}>
            {result.message}
          </p>
        )}
      </div>
    </Modal>
  );
}
