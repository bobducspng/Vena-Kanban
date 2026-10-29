import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Clock, Flag, CheckCircle2, Users, Zap } from "lucide-react";
import { api } from "../data/store";
import { EDITABLE_FIELD_TYPES, type AutomationRule, type Phase } from "../data/types";
import { useMe } from "../lib/useMe";
import { cn } from "../lib/cn";
import { AppShell } from "../components/app/AppShell";
import { PipeTabs } from "../components/app/PipeTabs";
import { Spinner } from "../components/ui/Spinner";
import { ACTION_LABEL, TRIGGER_LABEL } from "./PipeAutomations";

const TYPE_LABEL = Object.fromEntries(EDITABLE_FIELD_TYPES.map((t) => [t.value, t.label.replace(/ \(.*\)$/, "")])) as Record<string, string>;
const DOT: Record<string, string> = {
  gray: "bg-label-gray", red: "bg-label-red", orange: "bg-label-orange", amber: "bg-label-amber", green: "bg-label-green",
  teal: "bg-label-teal", blue: "bg-label-blue", purple: "bg-label-purple", pink: "bg-label-pink",
};
const dur = (min: number, business: boolean) => {
  const day = business ? 600 : 1440;
  return min >= day ? `${Math.round((min / day) * 10) / 10} ${business ? "dias úteis" : "dias"}` : min >= 60 ? `${Math.round(min / 6) / 10} h` : `${min} min`;
};
const ruleLine = (r: AutomationRule) => `${r.name}: ${r.actions.map((a) => ACTION_LABEL[a.type] ?? a.type).join(", ")}${r.active ? "" : " (desligada)"}`;

/** Aba Flow: the whole process on one screen — phases in order, their fields, where a
 *  card may go next and which automations fire there. Read-only; edit in Configurar. */
export function PipeFlow() {
  const { pipeId = "" } = useParams();
  const { isAdmin } = useMe();
  const { data: pipe } = useQuery({ queryKey: ["pipe", pipeId], queryFn: () => api.pipe.get(pipeId) });
  const { data: phases } = useQuery({ queryKey: ["phases", pipeId], queryFn: () => api.phase.listByPipe(pipeId) });
  const { data: fields } = useQuery({ queryKey: ["fields", pipeId], queryFn: () => api.field.listByPipe(pipeId) });
  const { data: rules } = useQuery({ queryKey: ["automations", pipeId], queryFn: () => api.automation.list(pipeId), enabled: isAdmin });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: api.user.list });

  const ordered = [...(phases ?? [])].sort((a, b) => a.position - b.position);
  const name = (id: string) => ordered.find((p) => p.id === id)?.name ?? "?";
  const business = !!pipe?.businessHoursOnly;
  const pipeWide = (rules ?? []).filter((r) => !r.trigger.phaseId);

  return (
    <AppShell title={pipe ? `${pipe.name} · Flow` : "Flow"}>
      <div className="flex flex-col gap-4 p-4">
        <div className="min-w-0">
          <Link to="/" className="text-xs text-muted hover:text-accent">← Pipes</Link>
          <h2 className="truncate text-lg text-text">{pipe?.icon && <span className="mr-1.5" aria-hidden="true">{pipe.icon}</span>}{pipe?.name ?? "…"}</h2>
          <PipeTabs pipeId={pipeId} />
        </div>
        <p className="text-sm text-muted">
          O processo inteiro numa tela: fases na ordem, campos de cada uma, para onde o card pode ir e o que roda sozinho.
          {pipe?.expirationMinutes ? ` Prazo total do card: ${dur(pipe.expirationMinutes, business)}.` : ""}
          {isAdmin && <> Para mudar, use <Link to={`/pipes/${pipeId}/settings`} className="text-accent hover:underline">Configurar</Link>.</>}
        </p>

        {isAdmin && pipeWide.length > 0 && (
          <section aria-label="Automações do pipe" className="rounded-lg border border-border p-3">
            <h3 className="mb-1 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted"><Zap className="h-3.5 w-3.5" aria-hidden="true" /> Automações do pipe (sem fase)</h3>
            <ul className="flex flex-col gap-0.5 text-sm text-text">
              {pipeWide.map((r) => <li key={r.id}><span className="text-muted">{TRIGGER_LABEL[r.trigger.type]} →</span> {ruleLine(r)}</li>)}
            </ul>
          </section>
        )}

        {!phases || !fields ? <Spinner className="h-5 w-5" label="Carregando" /> : (
          <ol className="flex gap-2 overflow-x-auto pb-2" aria-label="Fases">
            {ordered.map((p, i) => (
              <li key={p.id} className="flex items-start gap-2">
                <PhaseCard phase={p} name={name} business={business}
                  fields={fields.filter((f) => f.phaseId === p.id && !f.archivedAt).sort((a, b) => a.position - b.position)}
                  rules={(rules ?? []).filter((r) => r.trigger.phaseId === p.id)}
                  people={p.assigneeIds.map((id) => users?.find((u) => u.id === id)?.name).filter(Boolean) as string[]} />
                {i < ordered.length - 1 && <ArrowRight className="mt-6 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />}
              </li>
            ))}
          </ol>
        )}
      </div>
    </AppShell>
  );
}

function PhaseCard({ phase: p, fields, rules, people, name, business }: {
  phase: Phase; fields: { id: string; label: string; type: string; required: boolean }[]; rules: AutomationRule[]; people: string[];
  name: (id: string) => string; business: boolean;
}) {
  const when = (r: AutomationRule) => (r.trigger.type === "card_entered_phase" ? "Ao entrar" : r.trigger.type === "card_left_phase" ? "Ao sair" : TRIGGER_LABEL[r.trigger.type]);
  return (
    <article className="flex w-64 shrink-0 flex-col gap-3 rounded-lg border border-border bg-surface p-3 text-sm">
      <header>
        <h3 className="flex items-center gap-2 font-semibold text-text"><span className={cn("h-2.5 w-2.5 rounded-pill", DOT[p.color] ?? DOT.gray)} aria-hidden="true" />{p.name}</h3>
        <div className="mt-1 flex flex-wrap gap-1.5 text-xs text-muted">
          {p.isStart && <span className="inline-flex items-center gap-1"><Flag className="h-3 w-3" aria-hidden="true" /> Inicial</span>}
          {p.isEnd && <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3 w-3" aria-hidden="true" /> Final</span>}
          {p.slaMinutes && <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" aria-hidden="true" /> SLA {dur(p.slaMinutes, business)}</span>}
          {p.canCreateCard && !p.isStart && <span>Cria cards aqui</span>}
        </div>
        {p.description && <p className="mt-1 text-xs text-muted">{p.description}</p>}
      </header>

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Campos ({fields.length})</h4>
        {fields.length ? (
          <ul className="mt-1 flex flex-col gap-0.5">
            {fields.map((f) => (
              <li key={f.id} className="flex justify-between gap-2">
                <span className="truncate text-text">{f.label}{f.required && <span className="text-danger" aria-label="obrigatório"> *</span>}</span>
                <span className="shrink-0 text-xs text-muted">{TYPE_LABEL[f.type] ?? f.type}</span>
              </li>
            ))}
          </ul>
        ) : <p className="text-xs text-muted">Nenhum campo.</p>}
      </section>

      {people.length > 0 && (
        <p className="flex items-start gap-1.5 text-xs text-muted"><Users className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" /> Responsáveis: {people.join(", ")}</p>
      )}

      <section>
        <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Pode ir para</h4>
        <p className="mt-1 text-text">{p.allowedTo.length ? p.allowedTo.map(name).join(", ") : <span className="text-muted">nenhuma fase (só por automação)</span>}</p>
      </section>

      {rules.length > 0 && (
        <section>
          <h4 className="flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-muted"><Zap className="h-3 w-3" aria-hidden="true" /> Automações</h4>
          <ul className="mt-1 flex flex-col gap-0.5 text-xs text-text">
            {rules.map((r) => <li key={r.id}><span className="text-muted">{when(r)}:</span> {ruleLine(r)}</li>)}
          </ul>
        </section>
      )}
    </article>
  );
}
