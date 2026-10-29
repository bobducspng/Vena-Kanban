import { useMemo, useState } from "react";
import { useQueries, useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Download, FileBarChart, Plus, Save, Trash2 } from "lucide-react";
import { api } from "../data/store";
import type { Card, FieldDef, Label, Phase } from "../data/types";
import { useMe } from "../lib/useMe";
import { cn } from "../lib/cn";
import { BUILTIN, EMPTY_REPORT, isNumericField, runReport, type ReportConfig } from "../lib/reportEngine";
import { AppShell } from "../components/app/AppShell";
import { BarList } from "../components/app/Charts";
import { CardDetailModal } from "../components/app/CardDetailModal";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";

const RANGES = [
  { value: "all", label: "Todo o período" }, { value: "7d", label: "Últimos 7 dias" }, { value: "30d", label: "Últimos 30 dias" },
  { value: "90d", label: "Últimos 90 dias" }, { value: "this_month", label: "Este mês" }, { value: "last_month", label: "Mês passado" },
  { value: "this_year", label: "Este ano" }, { value: "custom", label: "Entre datas" },
];
const STATUS = [{ value: "all", label: "Todos" }, { value: "open", label: "Em aberto" }, { value: "done", label: "Concluídos" }, { value: "late", label: "Atrasados/vencidos" }];
const OPS = [{ value: "count", label: "Quantidade de cards" }, { value: "sum", label: "Soma" }, { value: "avg", label: "Média" }, { value: "min", label: "Mínimo" }, { value: "max", label: "Máximo" }];
const brl = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Relatórios: saved reports over one or more pipes, with filters, grouping and Excel export. */
export function Reports() {
  const qc = useQueryClient();
  const toast = useToast();
  const { me, isAdmin } = useMe();
  const { data: saved } = useQuery({ queryKey: ["reports"], queryFn: api.report.list });
  const { data: pipes } = useQuery({ queryKey: ["pipes"], queryFn: api.pipe.list });
  const { data: users } = useQuery({ queryKey: ["users"], queryFn: api.user.list });
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [cfg, setCfg] = useState<ReportConfig | null>(null);
  const [activeCard, setActiveCard] = useState<Card | null>(null);
  const [showCols, setShowCols] = useState(false);

  const open = (r: { id: string; name: string; config: unknown }) => { setCurrentId(r.id); setName(r.name); setCfg(r.config as ReportConfig); };
  const startNew = () => { if (!pipes?.length) return; setCurrentId(null); setName("Novo relatório"); setCfg(EMPTY_REPORT([pipes[0].id])); };

  // Data of the chosen pipes (each query already respects the person's access).
  const ids = cfg?.pipeIds ?? [];
  const per = (key: string, fn: (id: string) => Promise<unknown>) => useQueries({ queries: ids.map((id) => ({ queryKey: [key, id], queryFn: () => fn(id) })) });
  const cardsQ = per("cards", api.card.listByPipe);
  const phasesQ = per("phases", api.phase.listByPipe);
  const fieldsQ = per("fields", (id) => api.field.listByPipe(id));
  const labelsQ = per("labels", api.label.listByPipe);
  const loading = [cardsQ, phasesQ, fieldsQ, labelsQ].some((qs) => qs.some((q) => q.isLoading));
  const flat = <T,>(qs: { data?: unknown }[]) => qs.flatMap((q) => (q.data as T[] | undefined) ?? []);
  const fields = flat<FieldDef>(fieldsQ).filter((f) => !f.archivedAt);
  const phases = flat<Phase>(phasesQ);

  const result = useMemo(() => (cfg && !loading ? runReport(cfg, {
    pipes: pipes ?? [], phases, fields, cards: flat<Card>(cardsQ), users: users ?? [], labels: flat<Label>(labelsQ),
  }) : null), [cfg, loading, pipes, users, cardsQ, phasesQ, fieldsQ, labelsQ]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useMutation({
    mutationFn: () => api.report.save({ id: currentId ?? undefined, name: name.trim() || "Relatório", config: cfg! }),
    onSuccess: (r) => { setCurrentId(r.id); qc.invalidateQueries({ queryKey: ["reports"] }); toast("Relatório salvo", "success"); },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const remove = useMutation({
    mutationFn: () => api.report.remove(currentId!),
    onSuccess: () => { setCurrentId(null); setCfg(null); qc.invalidateQueries({ queryKey: ["reports"] }); },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const current = saved?.find((r) => r.id === currentId);
  const canEdit = !current || current.createdBy === me?.id || isAdmin;

  const exportXlsx = async () => {
    if (!result) return;
    const writeXlsxFile = (await import("write-excel-file/browser")).default;
    const head = result.columns.map((c) => ({ value: c.label, fontWeight: "bold" as const }));
    const sheets: { sheet: string; data: unknown[][] }[] = [{ sheet: "Cards", data: [head, ...result.rows.map((r) => r.cells.map((v) => (v === null ? null : { value: v })))] }];
    if (result.groups) {
      sheets.push({ sheet: "Resumo", data: [[{ value: "Grupo", fontWeight: "bold" as const }, { value: "Cards", fontWeight: "bold" as const }, { value: result.measureLabel, fontWeight: "bold" as const }],
        ...result.groups.map((g) => [{ value: g.label }, { value: g.count }, g.value === null ? null : { value: Math.round(g.value * 100) / 100 }])] });
    }
    await writeXlsxFile(sheets as never).toFile(`${(name || "relatorio").replace(/[\\/:*?"<>|]+/g, "_")}.xlsx`);
  };

  const set = (patch: Partial<ReportConfig>) => setCfg((c) => (c ? { ...c, ...patch } : c));
  const setF = (patch: Partial<ReportConfig["filters"]>) => setCfg((c) => (c ? { ...c, filters: { ...c.filters, ...patch } } : c));
  const dateFields = fields.filter((f) => ["date", "datetime", "due_date"].includes(f.type) || (f.type === "formula" && f.formula?.format === "date"));
  const groupFields = fields.filter((f) => ["select", "radio", "checkbox", "short_text", "assignee_select", "label_select"].includes(f.type));
  const numFields = fields.filter(isNumericField);
  const pipeTag = (f: FieldDef) => (ids.length > 1 ? ` · ${pipes?.find((p) => p.id === f.pipeId)?.name ?? ""}` : "");

  return (
    <AppShell title="Relatórios">
      <div className="flex flex-col gap-4 p-4 lg:flex-row">
        <aside className="flex w-full shrink-0 flex-col gap-2 lg:w-60">
          <Button onClick={startNew} disabled={!pipes?.length}><Plus className="h-4 w-4" aria-hidden="true" /> Novo relatório</Button>
          <ul className="flex flex-col gap-1">
            {(saved ?? []).map((r) => (
              <li key={r.id}>
                <button onClick={() => open(r)} className={cn("flex w-full flex-col rounded-md px-3 py-2 text-left text-sm hover:bg-surface", r.id === currentId && "bg-surface font-semibold text-accent")}>
                  <span className="truncate">{r.name}</span>
                  <span className="text-xs font-normal text-muted">{r.author ?? ""}</span>
                </button>
              </li>
            ))}
          </ul>
          {!saved?.length && <p className="px-1 text-xs text-muted">Nenhum relatório salvo ainda.</p>}
        </aside>

        {!cfg ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border p-12 text-center">
            <FileBarChart className="h-8 w-8 text-muted" aria-hidden="true" />
            <p className="text-sm text-muted">Crie um relatório ou abra um salvo. Dá para juntar vários pipes, filtrar por período, agrupar e somar valores, e baixar em Excel.</p>
          </div>
        ) : (
          <div className="flex min-w-0 flex-1 flex-col gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="min-w-56 flex-1"><Input aria-label="Nome do relatório" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} /></div>
              {canEdit && <Button onClick={() => save.mutate()} loading={save.isPending}><Save className="h-4 w-4" aria-hidden="true" /> Salvar</Button>}
              <Button variant="secondary" onClick={exportXlsx} disabled={!result?.rows.length}><Download className="h-4 w-4" aria-hidden="true" /> Excel</Button>
              {currentId && canEdit && <Button variant="ghost" aria-label="Excluir relatório" onClick={() => { if (confirm(`Excluir o relatório "${name}"?`)) remove.mutate(); }}><Trash2 className="h-4 w-4" /></Button>}
            </div>

            <section aria-label="Definição" className="grid gap-3 rounded-lg border border-border p-3 md:grid-cols-2 xl:grid-cols-3">
              <fieldset className="flex flex-col gap-1">
                <legend className="text-xs font-semibold uppercase tracking-wide text-muted">Pipes</legend>
                <div className="flex max-h-32 flex-col gap-1 overflow-auto">
                  {(pipes ?? []).map((p) => (
                    <label key={p.id} className="inline-flex items-center gap-2 text-sm text-text">
                      <input type="checkbox" className="h-4 w-4 accent-accent" checked={ids.includes(p.id)}
                        onChange={(e) => set({ pipeIds: e.target.checked ? [...ids, p.id] : ids.length > 1 ? ids.filter((x) => x !== p.id) : ids })} />
                      {p.name}
                    </label>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">Filtros</span>
                <Select aria-label="Situação" value={cfg.filters.status} options={STATUS} onValueChange={(v) => setF({ status: v as ReportConfig["filters"]["status"] })} />
                <Select aria-label="Responsável" value={cfg.filters.assigneeId ?? "__all"} onValueChange={(v) => setF({ assigneeId: v === "__all" ? null : v })}
                  options={[{ value: "__all", label: "Qualquer responsável" }, ...(users ?? []).map((u) => ({ value: u.id, label: u.name }))]} />
                <Select aria-label="Fase" value={cfg.filters.phaseNames[0] ?? "__all"} onValueChange={(v) => setF({ phaseNames: v === "__all" ? [] : [v] })}
                  options={[{ value: "__all", label: "Qualquer fase" }, ...[...new Set(phases.map((p) => p.name))].map((n) => ({ value: n, label: n }))]} />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">Período</span>
                <Select aria-label="Data do período" value={cfg.filters.period.by} onValueChange={(v) => setF({ period: { ...cfg.filters.period, by: v } })}
                  options={[{ value: "created", label: "Data de criação" }, { value: "due", label: "Vencimento" }, ...dateFields.map((f) => ({ value: `f:${f.id}`, label: `${f.label}${pipeTag(f)}` }))]} />
                <Select aria-label="Intervalo" value={cfg.filters.period.range} options={RANGES} onValueChange={(v) => setF({ period: { ...cfg.filters.period, range: v as ReportConfig["filters"]["period"]["range"] } })} />
                {cfg.filters.period.range === "custom" && (
                  <div className="flex gap-2">
                    <Input type="date" aria-label="De" value={cfg.filters.period.from ?? ""} onChange={(e) => setF({ period: { ...cfg.filters.period, from: e.target.value || null } })} />
                    <Input type="date" aria-label="Até" value={cfg.filters.period.to ?? ""} onChange={(e) => setF({ period: { ...cfg.filters.period, to: e.target.value || null } })} />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted">Agrupar e calcular</span>
                <Select aria-label="Agrupar por" value={cfg.groupBy} onValueChange={(v) => set({ groupBy: v })}
                  options={[{ value: "none", label: "Sem agrupar" }, ...(ids.length > 1 ? [{ value: "pipe", label: "Por pipe" }] : []), { value: "phase", label: "Por fase" }, { value: "assignee", label: "Por responsável" },
                    { value: "label", label: "Por etiqueta" }, { value: "month", label: "Por mês de criação" }, ...groupFields.map((f) => ({ value: `f:${f.id}`, label: `Por ${f.label}${pipeTag(f)}` }))]} />
                {cfg.groupBy !== "none" && (
                  <div className="flex gap-2">
                    <div className="w-40"><Select aria-label="Cálculo" value={cfg.measure.op} options={OPS} onValueChange={(v) => set({ measure: { ...cfg.measure, op: v as ReportConfig["measure"]["op"] } })} /></div>
                    {cfg.measure.op !== "count" && (
                      <div className="flex-1"><Select aria-label="Campo numérico" placeholder="Campo de número" value={cfg.measure.fieldId ?? undefined} onValueChange={(v) => set({ measure: { ...cfg.measure, fieldId: v } })}
                        options={numFields.map((f) => ({ value: f.id, label: `${f.label}${pipeTag(f)}` }))} /></div>
                    )}
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2 md:col-span-2 xl:col-span-2">
                <button className="self-start text-xs font-semibold uppercase tracking-wide text-accent" onClick={() => setShowCols((s) => !s)}>Colunas ({cfg.columns.length}) {showCols ? "▲" : "▼"}</button>
                {showCols && (
                  <div className="flex max-h-40 flex-wrap gap-x-4 gap-y-1 overflow-auto">
                    {[...BUILTIN.map((b) => ({ key: b.key, label: b.label })), ...fields.filter((f) => f.type !== "attachment").map((f) => ({ key: `f:${f.id}`, label: `${f.label}${pipeTag(f)}` }))].map((c) => (
                      <label key={c.key} className="inline-flex items-center gap-2 text-sm text-text">
                        <input type="checkbox" className="h-4 w-4 accent-accent" checked={cfg.columns.includes(c.key)}
                          onChange={(e) => set({ columns: e.target.checked ? [...cfg.columns, c.key] : cfg.columns.filter((k) => k !== c.key) })} />{c.label}
                      </label>
                    ))}
                  </div>
                )}
              </div>
            </section>

            {loading || !result ? <Spinner className="h-5 w-5" label="Carregando" /> : (
              <>
                {result.groups && (
                  <section aria-label="Resumo" className="flex flex-col gap-2 rounded-lg border border-border p-4">
                    <h3 className="text-sm font-semibold text-text">{result.measureLabel} {cfg.groupBy !== "none" ? "por grupo" : ""}</h3>
                    <BarList rows={result.groups.map((g) => ({ label: g.label, value: g.value, note: `${g.count} card(s)` }))} format={brl} empty="Nenhum card no filtro." />
                  </section>
                )}
                <section aria-label="Cards do relatório" className="flex flex-col gap-2">
                  <p className="text-xs text-muted">{result.rows.length} card(s)</p>
                  <div className="overflow-auto rounded-lg border border-border">
                    <table className="min-w-full text-sm">
                      <thead className="bg-surface text-left text-xs text-muted">
                        <tr>{result.columns.map((c) => <th key={c.key} scope="col" className={cn("whitespace-nowrap px-3 py-2 font-medium", c.numeric && "text-right")}>{c.label}</th>)}</tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {result.rows.slice(0, 1000).map((r) => (
                          <tr key={r.card.id} className="cursor-pointer hover:bg-surface" onClick={() => setActiveCard(r.card)}>
                            {r.cells.map((v, i) => <td key={i} className={cn("max-w-64 truncate px-3 py-1.5 text-text", result.columns[i].numeric && "text-right tabular-nums")}>{typeof v === "number" && result.columns[i].numeric ? brl(v) : v ?? ""}</td>)}
                          </tr>
                        ))}
                      </tbody>
                      {result.totals.some((t) => t !== null) && (
                        <tfoot className="bg-surface text-sm font-semibold text-text">
                          <tr>{result.totals.map((t, i) => <td key={i} className="px-3 py-2 text-right tabular-nums">{t === null ? (i === 0 ? "Total" : "") : brl(t)}</td>)}</tr>
                        </tfoot>
                      )}
                    </table>
                  </div>
                  {result.rows.length > 1000 && <p className="text-xs text-muted">Mostrando 1.000 de {result.rows.length}; o Excel leva todos.</p>}
                </section>
              </>
            )}
          </div>
        )}
      </div>
      {activeCard && <CardDetailModal cardId={activeCard.id} pipeId={activeCard.pipeId} open onOpenChange={(o) => !o && setActiveCard(null)} />}
    </AppShell>
  );
}
