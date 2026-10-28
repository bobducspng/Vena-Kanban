import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Pencil, Plus, Trash2, X } from "lucide-react";
import { api, type Condition } from "../../data/store";
import type { FieldDef, Phase } from "../../data/types";
import { VALUELESS, type ConditionAction, type FieldAction, type Operator, type Rule } from "../../lib/conditions";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";
import { useToast } from "../ui/Toast";

const OP_LABEL: Record<Operator, string> = {
  equals: "é igual a", not_equals: "é diferente de", present: "está preenchido", blank: "está vazio",
  string_contains: "contém", string_not_contains: "não contém",
  number_greater_than: "é maior que", number_less_than: "é menor que",
  date_is_today: "é hoje", date_is_yesterday: "foi ontem", date_in_current_week: "é nesta semana", date_in_last_week: "foi na semana passada",
  date_in_current_month: "é neste mês", date_in_last_month: "foi no mês passado", date_in_current_year: "é neste ano", date_in_last_year: "foi no ano passado",
  date_is: "é a data", date_is_after: "é depois de", date_is_before: "é antes de",
};
const LIST_TYPES = ["checklist", "assignee_select", "label_select"];
const DATE_OPS: Operator[] = ["date_is_today", "date_is_yesterday", "date_in_current_week", "date_in_last_week", "date_in_current_month",
  "date_in_last_month", "date_in_current_year", "date_in_last_year", "date_is", "date_is_after", "date_is_before"];

/** Operators that make sense for a field type. */
function operatorsFor(type: string): Operator[] {
  if (["date", "due_date", "datetime"].includes(type)) return [...DATE_OPS, "present", "blank"];
  if (["number", "currency"].includes(type)) return ["equals", "not_equals", "number_greater_than", "number_less_than", "present", "blank"];
  if (type === "checkbox") return ["equals"];
  if (type === "attachment") return ["present", "blank"];
  if (["select", "radio", "time", ...LIST_TYPES].includes(type)) return ["equals", "not_equals", "present", "blank"];
  return ["equals", "not_equals", "string_contains", "string_not_contains", "present", "blank"];
}
const opLabel = (op: Operator, type: string) =>
  LIST_TYPES.includes(type) && op === "equals" ? "inclui" : LIST_TYPES.includes(type) && op === "not_equals" ? "não inclui" : OP_LABEL[op];

const ACTION_LABEL: Record<ConditionAction, string> = { show: "Mostrar", hide: "Ocultar", require: "Tornar obrigatório", optional: "Tornar opcional" };
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado");

/** Conditionals of one phase: list (order matters: later ones win) + editor. */
export function ConditionsSection({ phase, phases, fields }: { phase: Phase; phases: Phase[]; fields: FieldDef[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<Condition | "new" | null>(null);
  const { data: all } = useQuery({ queryKey: ["conditions", phase.pipeId], queryFn: () => api.condition.listByPipe(phase.pipeId) });
  const list = (all ?? []).filter((c) => c.phaseId === phase.id).sort((a, b) => a.position - b.position);
  const done = () => qc.invalidateQueries({ queryKey: ["conditions", phase.pipeId] });
  const move = useMutation({ mutationFn: (p: { id: string; dir: -1 | 1 }) => api.condition.move(p.id, p.dir), onSuccess: done, onError: (e) => toast(errMsg(e), "error") });
  const remove = useMutation({ mutationFn: api.condition.remove, onSuccess: done, onError: (e) => toast(errMsg(e), "error") });

  // Sources: this phase and earlier ones. Targets: this phase.
  const reached = new Set(phases.filter((p) => p.position <= phase.position).map((p) => p.id));
  const sources = fields.filter((f) => reached.has(f.phaseId) && f.type !== "id");
  const targets = fields.filter((f) => f.phaseId === phase.id);
  const name = (id: string) => fields.find((f) => f.id === id)?.label ?? "(campo removido)";

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-text">Condicionais</h3>
          <p className="text-xs text-muted">Mostram, ocultam ou tornam obrigatórios campos desta fase conforme as respostas. Campo oculto não é cobrado.</p>
        </div>
        <Button size="sm" variant="secondary" disabled={targets.length === 0} onClick={() => setEditing("new")}><Plus className="h-4 w-4" aria-hidden="true" /> Nova condicional</Button>
      </div>
      {list.length > 0 && (
        <ol className="flex flex-col divide-y divide-border rounded-md border border-border">
          {list.map((c, i) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text">{c.name}</p>
                <p className="truncate text-xs text-muted">
                  {c.onTrue.map((a) => `${ACTION_LABEL[a.action]} ${name(a.fieldId)}`).join(", ") || "—"}
                  {c.onFalse.length > 0 && ` · senão: ${c.onFalse.map((a) => `${ACTION_LABEL[a.action]} ${name(a.fieldId)}`).join(", ")}`}
                </p>
              </div>
              <button aria-label={`Subir ${c.name}`} disabled={i === 0} onClick={() => move.mutate({ id: c.id, dir: -1 })} className="rounded p-1 text-muted hover:bg-surface disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
              <button aria-label={`Descer ${c.name}`} disabled={i === list.length - 1} onClick={() => move.mutate({ id: c.id, dir: 1 })} className="rounded p-1 text-muted hover:bg-surface disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
              <button aria-label={`Editar ${c.name}`} onClick={() => setEditing(c)} className="rounded p-1 text-muted hover:bg-surface"><Pencil className="h-4 w-4" /></button>
              <button aria-label={`Excluir ${c.name}`} onClick={() => { if (confirm(`Excluir a condicional "${c.name}"?`)) remove.mutate(c.id); }} className="rounded p-1 text-muted hover:bg-surface hover:text-danger"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ol>
      )}
      {list.length > 1 && <p className="text-xs text-muted">A ordem importa: se duas condicionais mexem no mesmo campo, vale a de baixo.</p>}
      <ConditionModal phaseId={phase.id} editing={editing} sources={sources} targets={targets} onClose={() => setEditing(null)} onSaved={done} />
    </div>
  );
}

const emptyRule = (f?: FieldDef): Rule => ({ fieldId: f?.id ?? "", operator: f ? operatorsFor(f.type)[0] : "equals", value: "" });

function ConditionModal({ phaseId, editing, sources, targets, onClose, onSaved }: {
  phaseId: string; editing: Condition | "new" | null; sources: FieldDef[]; targets: FieldDef[]; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const existing = editing && editing !== "new" ? editing : null;
  const [name, setName] = useState("");
  const [groups, setGroups] = useState<Rule[][]>([]);
  const [onTrue, setOnTrue] = useState<FieldAction[]>([]);
  const [onFalse, setOnFalse] = useState<FieldAction[]>([]);

  useEffect(() => {
    if (!editing) return;
    setName(existing?.name ?? "");
    setGroups(existing ? existing.groups : [[emptyRule(sources[0])]]);
    setOnTrue(existing ? existing.onTrue : [{ fieldId: targets[0]?.id ?? "", action: "show" }]);
    setOnFalse(existing ? existing.onFalse : []);
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: async (): Promise<unknown> => {
      const body = {
        name: name.trim(),
        groups: groups.map((g) => g.map((r) => (VALUELESS.has(r.operator) ? { fieldId: r.fieldId, operator: r.operator } : r))),
        onTrue: onTrue.filter((a) => a.fieldId),
        onFalse: onFalse.filter((a) => a.fieldId),
      };
      return existing ? api.condition.update({ conditionId: existing.id, ...body }) : api.condition.create({ phaseId, ...body });
    },
    onSuccess: () => { onSaved(); toast(existing ? "Condicional atualizada" : "Condicional criada", "success"); onClose(); },
    onError: (e) => toast(errMsg(e), "error"),
  });

  const setRule = (gi: number, ri: number, patch: Partial<Rule>) =>
    setGroups((gs) => gs.map((g, i) => (i !== gi ? g : g.map((r, j) => (j === ri ? { ...r, ...patch } : r)))));
  const removeRule = (gi: number, ri: number) =>
    setGroups((gs) => gs.map((g, i) => (i === gi ? g.filter((_, j) => j !== ri) : g)).filter((g) => g.length > 0));

  const incomplete = !name.trim() || groups.length === 0
    || groups.some((g) => g.some((r) => !r.fieldId || (!VALUELESS.has(r.operator) && (r.value === "" || r.value === null || r.value === undefined))))
    || onTrue.length + onFalse.length === 0;

  return (
    <Modal open={!!editing} onOpenChange={(o) => !o && onClose()} title={existing ? "Editar condicional" : "Nova condicional"} size="wide"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={incomplete}>Salvar</Button></>}>
      <div className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="cond-name" className="text-sm font-medium text-text">Nome</label>
          <Input id="cond-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Pedir justificativa acima de R$ 1.000" />
        </div>

        <section aria-label="Quando" className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold text-text">Quando</h3>
          {groups.map((g, gi) => (
            <div key={gi} className="flex flex-col gap-2">
              {gi > 0 && <p className="text-xs font-semibold uppercase tracking-wide text-accent">ou</p>}
              <div className="flex flex-col gap-2 rounded-md border border-border p-3">
                {g.map((r, ri) => (
                  <div key={ri} className="flex flex-col gap-1">
                    {ri > 0 && <p className="text-xs font-semibold uppercase tracking-wide text-muted">e</p>}
                    <RuleRow rule={r} sources={sources}
                      onChange={(patch) => setRule(gi, ri, patch)} onRemove={() => removeRule(gi, ri)} />
                  </div>
                ))}
                <Button size="sm" variant="ghost" className="self-start" onClick={() => setGroups((gs) => gs.map((x, i) => (i === gi ? [...x, emptyRule(sources[0])] : x)))}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> E (outra regra neste grupo)
                </Button>
              </div>
            </div>
          ))}
          <Button size="sm" variant="secondary" className="self-start" onClick={() => setGroups((gs) => [...gs, [emptyRule(sources[0])]])}>
            <Plus className="h-4 w-4" aria-hidden="true" /> OU (novo grupo)
          </Button>
        </section>

        <ActionList title="Então (se verdadeiro)" actions={onTrue} setActions={setOnTrue} targets={targets} />
        <ActionList title="Senão (se falso)" actions={onFalse} setActions={setOnFalse} targets={targets} />
        <p className="text-xs text-muted">Um campo com a ação "Mostrar" começa oculto e só aparece quando a regra o mostra.</p>
      </div>
    </Modal>
  );
}

function RuleRow({ rule, sources, onChange, onRemove }: { rule: Rule; sources: FieldDef[]; onChange: (p: Partial<Rule>) => void; onRemove: () => void }) {
  const field = sources.find((f) => f.id === rule.fieldId);
  const ops = field ? operatorsFor(field.type) : [];
  return (
    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_12rem_minmax(0,1fr)_auto] sm:items-center">
      <Select aria-label="Campo" value={rule.fieldId || undefined} placeholder="Campo"
        onValueChange={(id) => { const f = sources.find((x) => x.id === id); onChange({ fieldId: id, operator: f ? operatorsFor(f.type)[0] : "equals", value: "" }); }}
        options={sources.map((f) => ({ value: f.id, label: f.label }))} />
      <Select aria-label="Operador" value={rule.operator} disabled={!field}
        onValueChange={(op) => onChange({ operator: op as Operator })}
        options={ops.map((op) => ({ value: op, label: opLabel(op, field?.type ?? "") }))} />
      {field && !VALUELESS.has(rule.operator) ? <ValueInput field={field} value={rule.value} onChange={(value) => onChange({ value })} /> : <span />}
      <button aria-label="Remover regra" onClick={onRemove} className="justify-self-start rounded p-1 text-muted hover:text-danger"><X className="h-4 w-4" /></button>
    </div>
  );
}

/** Comparison value, shaped by the source field's type. */
function ValueInput({ field, value, onChange }: { field: FieldDef; value: Rule["value"]; onChange: (v: string | number | null) => void }) {
  const { data: members } = useQuery({ queryKey: ["users"], queryFn: api.user.list, enabled: field.type === "assignee_select" });
  const { data: labels } = useQuery({ queryKey: ["labels", field.pipeId], queryFn: () => api.label.listByPipe(field.pipeId), enabled: field.type === "label_select" });
  const v = value === null || value === undefined ? "" : String(value);
  const pick = (options: { value: string; label: string }[]) =>
    <Select aria-label="Valor" value={v || undefined} placeholder="Valor" onValueChange={onChange} options={options} />;

  if (["select", "radio", "checklist"].includes(field.type)) return pick((field.options ?? []).map((o) => ({ value: o, label: o })));
  if (field.type === "checkbox") return pick([{ value: "true", label: "Sim" }, { value: "false", label: "Não" }]);
  if (field.type === "assignee_select") return pick((members ?? []).map((m) => ({ value: m.id, label: m.name })));
  if (field.type === "label_select") return pick((labels ?? []).map((l) => ({ value: l.id, label: l.name })));
  if (["number", "currency"].includes(field.type)) {
    return <Input aria-label="Valor" type="number" inputMode="decimal" value={v} onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />;
  }
  if (["date", "due_date", "datetime"].includes(field.type)) return <Input aria-label="Valor" type="date" value={v} onChange={(e) => onChange(e.target.value)} />;
  if (field.type === "time") return <Input aria-label="Valor" type="time" value={v} onChange={(e) => onChange(e.target.value)} />;
  return <Input aria-label="Valor" value={v} onChange={(e) => onChange(e.target.value)} placeholder="Valor" />;
}

function ActionList({ title, actions, setActions, targets }: {
  title: string; actions: FieldAction[]; setActions: (f: (a: FieldAction[]) => FieldAction[]) => void; targets: FieldDef[];
}) {
  const set = (i: number, patch: Partial<FieldAction>) => setActions((as) => as.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-text">{title}</h3>
      {actions.length === 0 && <p className="text-xs text-muted">Nenhuma ação.</p>}
      {actions.map((a, i) => (
        <div key={i} className="grid gap-2 sm:grid-cols-[12rem_minmax(0,1fr)_auto] sm:items-center">
          <Select aria-label="Ação" value={a.action} onValueChange={(x) => set(i, { action: x as ConditionAction })}
            options={(Object.keys(ACTION_LABEL) as ConditionAction[]).map((x) => ({ value: x, label: ACTION_LABEL[x] }))} />
          <Select aria-label="Campo afetado" value={a.fieldId || undefined} placeholder="Campo" onValueChange={(id) => set(i, { fieldId: id })}
            options={targets.map((f) => ({ value: f.id, label: f.label }))} />
          <button aria-label="Remover ação" onClick={() => setActions((as) => as.filter((_, j) => j !== i))} className="justify-self-start rounded p-1 text-muted hover:text-danger"><X className="h-4 w-4" /></button>
        </div>
      ))}
      <Button size="sm" variant="ghost" className="self-start" onClick={() => setActions((as) => [...as, { fieldId: targets[0]?.id ?? "", action: "show" }])}>
        <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar ação
      </Button>
    </section>
  );
}
