import { useMemo, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Columns3, Download, Filter, Plus, X } from "lucide-react";
import { api } from "../data/store";
import type { Card, FieldDef } from "../data/types";
import { evalExpression, type Rule } from "../lib/conditions";
import { formatValue } from "../lib/format";
import { useMe } from "../lib/useMe";
import { cn } from "../lib/cn";
import { AppShell } from "../components/app/AppShell";
import { PipeTabs } from "../components/app/PipeTabs";
import { CardDetailModal } from "../components/app/CardDetailModal";
import { RuleRow, emptyRule } from "../components/app/ConditionsEditor";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";
import { Tag } from "../components/ui/Tag";
import { useToast } from "../components/ui/Toast";

type Status = "all" | "open" | "done" | "late" | "expired" | "overdue";
const STATUS_LABEL: Record<Status, string> = { all: "Todas as situações", open: "Em andamento", done: "Concluídos", late: "Atrasados", expired: "Expirados", overdue: "Vencidos" };
const BUILTIN = [
  { key: "number", label: "#" }, { key: "title", label: "Título" }, { key: "phase", label: "Fase" },
  { key: "assignees", label: "Responsáveis" }, { key: "labels", label: "Etiquetas" }, { key: "due", label: "Vencimento" },
  { key: "created", label: "Criado em" }, { key: "status", label: "Situação" },
] as const;
const DEFAULT_COLS = ["number", "title", "phase", "assignees", "due", "status"];
const store = {
  get: (k: string, d: string[]) => { try { return JSON.parse(localStorage.getItem(k) ?? "") as string[]; } catch { return d; } },
  set: (k: string, v: string[]) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* private mode */ } },
};
const dmy = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");
const statusOf = (c: Card) => (c.done ? "Concluído" : c.overdueAt ? "Vencido" : c.expiredAt ? "Expirado" : c.lateAt ? "Atrasado" : "Em andamento");

/** S04 — list view: columns, sort, filters (incl. E/OU field conditions), bulk actions, export. */
export function PipeList() {
  const { pipeId = "" } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const { isAdmin } = useMe();
  const colsKey = `venaflow.listcols.${pipeId}`;
  const [cols, setCols] = useState<string[]>(() => store.get(colsKey, DEFAULT_COLS));
  const [pickCols, setPickCols] = useState(false);
  const [sort, setSort] = useState<{ key: string; dir: 1 | -1 }>({ key: "number", dir: -1 });
  const [q, setQ] = useState("");
  const [phaseId, setPhaseId] = useState("__all");
  const [who, setWho] = useState("__all");
  const [labelId, setLabelId] = useState("__all");
  const [status, setStatus] = useState<Status>("all");
  const [groups, setGroups] = useState<Rule[][]>([]);
  const [showAdv, setShowAdv] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);

  const { data: pipe } = useQuery({ queryKey: ["pipe", pipeId], queryFn: () => api.pipe.get(pipeId) });
  const { data: phases } = useQuery({ queryKey: ["phases", pipeId], queryFn: () => api.phase.listByPipe(pipeId) });
  const { data: fields } = useQuery({ queryKey: ["fields", pipeId], queryFn: () => api.field.listByPipe(pipeId) });
  const { data: cards, isLoading } = useQuery({ queryKey: ["cards", pipeId], queryFn: () => api.card.listByPipe(pipeId) });
  const { data: members } = useQuery({ queryKey: ["users"], queryFn: api.user.list });
  const { data: labels } = useQuery({ queryKey: ["labels", pipeId], queryFn: () => api.label.listByPipe(pipeId) });

  const fieldCols = (fields ?? []).filter((f) => !["attachment", "id"].includes(f.type));
  const phaseName = (id: string) => phases?.find((p) => p.id === id)?.name ?? "";
  const names = (ids: string[]) => ids.map((id) => members?.find((m) => m.id === id)?.name ?? "?").join(", ");
  const val = (c: Card, f: FieldDef) => c.values.find((v) => v.fieldId === f.id)?.value;

  /** Text of a column for a card (display, sort and export). */
  const text = (c: Card, key: string): string => {
    switch (key) {
      case "number": return String(c.number);
      case "title": return c.title;
      case "phase": return phaseName(c.currentPhaseId);
      case "assignees": return names(c.assigneeIds);
      case "labels": return c.labelIds.map((id) => labels?.find((l) => l.id === id)?.name ?? "").join(", ");
      case "due": return dmy(c.dueDate);
      case "created": return dmy(c.createdAt);
      case "status": return statusOf(c);
    }
    const f = fields?.find((x) => x.id === key);
    return f ? formatValue(f, val(c, f), { members, labels }) : "";
  };
  /** Sort key: raw values where order matters (numbers, dates). */
  const sortKey = (c: Card, key: string): string | number => {
    if (key === "number") return c.number;
    if (key === "due") return c.dueDate ? new Date(c.dueDate).getTime() : Infinity;
    if (key === "created") return new Date(c.createdAt).getTime();
    const f = fields?.find((x) => x.id === key);
    if (f && ["number", "currency"].includes(f.type)) { const v = val(c, f); return typeof v === "number" ? v : -Infinity; }
    if (f && ["date", "due_date", "datetime"].includes(f.type)) { const v = val(c, f); return typeof v === "string" ? v : ""; }
    return text(c, key).toLowerCase();
  };

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase().replace(/^#/, "");
    const list = (cards ?? []).filter((c) => {
      if (phaseId !== "__all" && c.currentPhaseId !== phaseId) return false;
      if (who === "__none" ? c.assigneeIds.length > 0 : who !== "__all" && !c.assigneeIds.includes(who)) return false;
      if (labelId !== "__all" && !c.labelIds.includes(labelId)) return false;
      if (status === "open" && c.done) return false;
      if (status === "done" && !c.done) return false;
      if (status === "late" && (!c.lateAt || c.done)) return false;
      if (status === "expired" && (!c.expiredAt || c.done)) return false;
      if (status === "overdue" && (!c.overdueAt || c.done)) return false;
      if (term && String(c.number) !== term && !c.title.toLowerCase().includes(term) && !fieldCols.some((f) => text(c, f.id).toLowerCase().includes(term))) return false;
      if (groups.length && !evalExpression(groups, Object.fromEntries(c.values.map((v) => [v.fieldId, v.value])))) return false;
      return true;
    });
    return list.sort((a, b) => { const x = sortKey(a, sort.key), y = sortKey(b, sort.key); return (x < y ? -1 : x > y ? 1 : 0) * sort.dir; });
  }, [cards, phaseId, who, labelId, status, q, groups, sort, fields, members, labels, phases]); // eslint-disable-line react-hooks/exhaustive-deps

  const colLabel = (k: string) => BUILTIN.find((b) => b.key === k)?.label ?? fields?.find((f) => f.id === k)?.label ?? "?";
  const visibleCols = cols.filter((k) => BUILTIN.some((b) => b.key === k) || fieldCols.some((f) => f.id === k));
  const toggleCol = (k: string) => { const next = cols.includes(k) ? cols.filter((x) => x !== k) : [...cols, k]; setCols(next); store.set(colsKey, next); };
  const allSelected = rows.length > 0 && rows.every((r) => selected.has(r.id));
  const chosen = rows.filter((r) => selected.has(r.id));

  const exportCsv = () => {
    const out = chosen.length ? chosen : rows;
    const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = [visibleCols.map(colLabel), ...out.map((c) => visibleCols.map((k) => text(c, k)))].map((r) => r.map(cell).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `${pipe?.name ?? "cards"}.csv`; a.click(); URL.revokeObjectURL(url);
  };

  const bulk = useMutation({
    mutationFn: (action: Parameters<typeof api.card.bulk>[0]["action"]) => api.card.bulk({ pipeId, cardIds: chosen.map((c) => c.id), action }),
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["cards", pipeId] });
      setSelected(new Set());
      if (r.failed.length) toast(`${r.done} feito(s); ${r.failed.length} não: ${r.failed.slice(0, 3).map((f) => `#${f.number} (${f.reason})`).join("; ")}${r.failed.length > 3 ? "…" : ""}`, "error");
      else toast(`${r.done} card(s) atualizado(s)`, "success");
    },
    onError: (e) => toast(e instanceof Error ? e.message : "Falhou", "error"),
  });

  return (
    <AppShell title={pipe?.name ?? "Lista"}>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <Link to="/" className="text-xs text-muted hover:text-accent">← Pipes</Link>
            <h2 className="truncate text-lg text-text">{pipe?.icon && <span className="mr-1.5" aria-hidden="true">{pipe.icon}</span>}{pipe?.name ?? "…"}</h2>
            <PipeTabs pipeId={pipeId} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="secondary" onClick={() => setPickCols((o) => !o)}><Columns3 className="h-4 w-4" aria-hidden="true" /> Colunas</Button>
            <Button variant="secondary" onClick={exportCsv} disabled={!rows.length}><Download className="h-4 w-4" aria-hidden="true" /> Exportar{chosen.length ? ` (${chosen.length})` : ""}</Button>
          </div>
        </div>

        {pickCols && (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 rounded-md border border-border p-3">
            {[...BUILTIN.map((b) => ({ key: b.key as string, label: b.label })), ...fieldCols.map((f) => ({ key: f.id, label: f.label }))].map((c) => (
              <label key={c.key} className="inline-flex items-center gap-2 text-sm text-text">
                <input type="checkbox" className="h-4 w-4 accent-accent" checked={cols.includes(c.key)} onChange={() => toggleCol(c.key)} />{c.label}
              </label>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <Input data-shortcut="search" aria-label="Buscar" placeholder="Buscar #ID, título ou campo" value={q} onChange={(e) => setQ(e.target.value)} className="w-60" />
          <div className="w-44"><Select aria-label="Fase" value={phaseId} onValueChange={setPhaseId} options={[{ value: "__all", label: "Todas as fases" }, ...(phases ?? []).map((p) => ({ value: p.id, label: p.name }))]} /></div>
          <div className="w-48"><Select aria-label="Responsável" value={who} onValueChange={setWho} options={[{ value: "__all", label: "Qualquer responsável" }, { value: "__none", label: "Sem responsável" }, ...(members ?? []).map((m) => ({ value: m.id, label: m.name }))]} /></div>
          {!!labels?.length && <div className="w-44"><Select aria-label="Etiqueta" value={labelId} onValueChange={setLabelId} options={[{ value: "__all", label: "Qualquer etiqueta" }, ...labels.map((l) => ({ value: l.id, label: l.name }))]} /></div>}
          <div className="w-44"><Select aria-label="Situação" value={status} onValueChange={(v) => setStatus(v as Status)} options={(Object.keys(STATUS_LABEL) as Status[]).map((s) => ({ value: s, label: STATUS_LABEL[s] }))} /></div>
          <Button variant={groups.length ? "primary" : "ghost"} size="sm" onClick={() => setShowAdv((o) => !o)}><Filter className="h-4 w-4" aria-hidden="true" /> Por campo{groups.length ? ` (${groups.flat().length})` : ""}</Button>
        </div>

        {showAdv && (
          <div className="flex flex-col gap-2 rounded-md border border-border p-3">
            {groups.map((g, gi) => (
              <div key={gi} className="flex flex-col gap-2">
                {gi > 0 && <p className="text-xs font-semibold uppercase text-accent">ou</p>}
                <div className="flex flex-col gap-2 rounded border border-border p-2">
                  {g.map((r, ri) => (
                    <div key={ri}>
                      {ri > 0 && <p className="text-xs font-semibold uppercase text-muted">e</p>}
                      <RuleRow rule={r} sources={fieldCols} onChange={(p) => setGroups((gs) => gs.map((x, i) => (i !== gi ? x : x.map((y, j) => (j === ri ? { ...y, ...p } : y)))))}
                        onRemove={() => setGroups((gs) => gs.map((x, i) => (i === gi ? x.filter((_, j) => j !== ri) : x)).filter((x) => x.length))} />
                    </div>
                  ))}
                  <Button size="sm" variant="ghost" className="self-start" onClick={() => setGroups((gs) => gs.map((x, i) => (i === gi ? [...x, emptyRule(fieldCols[0])] : x)))}><Plus className="h-4 w-4" aria-hidden="true" /> E</Button>
                </div>
              </div>
            ))}
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" onClick={() => setGroups((gs) => [...gs, [emptyRule(fieldCols[0])]])}><Plus className="h-4 w-4" aria-hidden="true" /> {groups.length ? "OU" : "Adicionar condição"}</Button>
              {!!groups.length && <Button size="sm" variant="ghost" onClick={() => setGroups([])}><X className="h-4 w-4" aria-hidden="true" /> Limpar</Button>}
            </div>
          </div>
        )}

        {isAdmin && chosen.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 rounded-md bg-surface p-2 text-sm">
            <span className="font-medium text-text">{chosen.length} selecionado(s)</span>
            <div className="w-48"><Select aria-label="Mover para" placeholder="Mover para…" onValueChange={(v) => bulk.mutate({ type: "move", phaseId: v })} options={(phases ?? []).map((p) => ({ value: p.id, label: p.name }))} /></div>
            <div className="w-52"><Select aria-label="Atribuir a" placeholder="Atribuir a…" onValueChange={(v) => bulk.mutate({ type: "assign", userIds: v === "__none" ? [] : [v], mode: "replace" })} options={[{ value: "__none", label: "Ninguém (remover)" }, ...(members ?? []).map((m) => ({ value: m.id, label: m.name }))]} /></div>
            <Button size="sm" variant="secondary" loading={bulk.isPending} onClick={() => { if (confirm(`Enviar ${chosen.length} card(s) para a lixeira?`)) bulk.mutate({ type: "delete" }); }}>Excluir</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Limpar seleção</Button>
          </div>
        )}

        {isLoading ? <Spinner className="h-4 w-4" label="Carregando" /> : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  {isAdmin && (
                    <th scope="col" className="w-8 px-3 py-2">
                      <input type="checkbox" aria-label="Selecionar todos" className="h-4 w-4 accent-accent" checked={allSelected}
                        onChange={(e) => setSelected(e.target.checked ? new Set(rows.map((r) => r.id)) : new Set())} />
                    </th>
                  )}
                  {visibleCols.map((k) => (
                    <th key={k} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold"
                      aria-sort={sort.key === k ? (sort.dir === 1 ? "ascending" : "descending") : "none"}>
                      <button className="inline-flex items-center gap-1 hover:text-text" onClick={() => setSort((s) => ({ key: k, dir: s.key === k ? (-s.dir as 1 | -1) : 1 }))}>
                        {colLabel(k)}{sort.key === k && (sort.dir === 1 ? <ArrowUp className="h-3 w-3" aria-hidden="true" /> : <ArrowDown className="h-3 w-3" aria-hidden="true" />)}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((c) => (
                  <tr key={c.id} className={cn("hover:bg-surface", selected.has(c.id) && "bg-surface")}>
                    {isAdmin && (
                      <td className="px-3 py-2">
                        <input type="checkbox" aria-label={`Selecionar #${c.number}`} className="h-4 w-4 accent-accent" checked={selected.has(c.id)}
                          onChange={(e) => setSelected((s) => { const n = new Set(s); if (e.target.checked) n.add(c.id); else n.delete(c.id); return n; })} />
                      </td>
                    )}
                    {visibleCols.map((k) => (
                      <td key={k} className={cn("max-w-72 truncate px-3 py-2", k === "title" ? "font-medium text-text" : "text-muted")}>
                        {k === "title" ? <button className="text-left hover:text-accent" onClick={() => setActiveId(c.id)}>{c.title}</button>
                          : k === "phase" ? <Tag color={phases?.find((p) => p.id === c.currentPhaseId)?.color}>{text(c, k)}</Tag>
                          : k === "status" ? <span className={cn(c.done ? "text-success" : c.overdueAt || c.expiredAt ? "text-danger" : c.lateAt ? "text-warning" : "")}>{text(c, k)}</span>
                          : text(c, k)}
                      </td>
                    ))}
                  </tr>
                ))}
                {!rows.length && <tr><td colSpan={visibleCols.length + 1} className="px-3 py-8 text-center text-sm text-muted">Nenhum card com esses filtros.</td></tr>}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-muted">{rows.length} de {cards?.length ?? 0} card(s){isAdmin ? " · marque para ações em massa" : ""}</p>
      </div>
      <CardDetailModal cardId={activeId} pipeId={pipeId} open={!!activeId} onOpenChange={(o) => !o && setActiveId(null)} />
    </AppShell>
  );
}
