import { useState } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Archive, ArchiveRestore, ArrowDown, ArrowUp, Download, Pencil, Plus, Search, Settings, Trash2 } from "lucide-react";
import { api } from "../data/store";
import { DB_COLUMN_TYPES, PHASE_COLORS, type DataTable, type DbRecord, type FieldDef, type PhaseColor } from "../data/types";
import { useMe } from "../lib/useMe";
import { formatValue } from "../lib/format";
import { AppShell } from "../components/app/AppShell";
import { FieldEditorModal } from "../components/app/FieldEditorModal";
import { RecordModal } from "../components/app/RecordModal";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado");
const COLOR_LABEL: Record<PhaseColor, string> = {
  gray: "Cinza", red: "Vermelho", orange: "Laranja", amber: "Âmbar", green: "Verde",
  teal: "Verde-azulado", blue: "Azul", purple: "Roxo", pink: "Rosa",
};
const TYPE_LABEL = Object.fromEntries(DB_COLUMN_TYPES.map((t) => [t.value, t.label])) as Record<string, string>;
const TITLE_TYPES = ["short_text", "long_text", "email", "phone", "document", "number", "select", "radio", "date"];

/** S14 — one database: records grid, search, CSV export, record form; admins configure columns. */
export function DatabaseView() {
  const { tableId = "" } = useParams();
  const { isAdmin } = useMe();
  const { data: members } = useQuery({ queryKey: ["users"], queryFn: api.user.list });
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState<DbRecord | "new" | null>(null);
  const [settings, setSettings] = useState(false);

  const { data: table } = useQuery({ queryKey: ["database", tableId], queryFn: () => api.database.get(tableId) });
  const { data: columns } = useQuery({ queryKey: ["dbColumns", tableId], queryFn: () => api.database.columns(tableId) });
  const { data: records, isLoading } = useQuery({ queryKey: ["dbRecords", tableId], queryFn: () => api.database.records(tableId) });

  const cols = columns ?? [];
  const others = cols.filter((c) => c.id !== table?.titleFieldId);
  const titleCol = cols.find((c) => c.id === table?.titleFieldId);
  const text = (r: DbRecord, c: FieldDef) => formatValue(c, r.values.find((v) => v.fieldId === c.id)?.value, { members });
  const q = query.trim().toLowerCase();
  const visible = (records ?? []).filter((r) => !q || r.title.toLowerCase().includes(q) || others.some((c) => text(r, c).toLowerCase().includes(q)));

  /** Spreadsheet export: ";"-separated with BOM, which Excel in pt-BR opens directly. */
  const exportCsv = () => {
    const header = [titleCol?.label ?? "Nome", ...others.map((c) => c.label)];
    const rows = visible.map((r) => [r.title, ...others.map((c) => text(r, c))]);
    const cell = (s: string) => `"${s.replace(/"/g, '""')}"`;
    const csv = [header, ...rows].map((row) => row.map(cell).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url; a.download = `${table?.name ?? "database"}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell title={table?.name ?? "Database"}>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <Link to="/databases" className="text-xs text-muted hover:text-accent">← Bancos de dados</Link>
            <h2 className="truncate text-lg text-text">{table?.icon && <span className="mr-1.5" aria-hidden="true">{table.icon}</span>}{table?.name ?? "…"}</h2>
            {table?.description && <p className="text-sm text-muted">{table.description}</p>}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <Input data-shortcut="search" aria-label="Buscar registros" placeholder="Buscar" value={query} onChange={(e) => setQuery(e.target.value)} className="w-56 pl-8" />
            </div>
            <Button variant="secondary" onClick={exportCsv} disabled={!visible.length}><Download className="h-4 w-4" aria-hidden="true" /> Exportar</Button>
            {isAdmin && <Button variant="secondary" onClick={() => setSettings((s) => !s)}><Settings className="h-4 w-4" aria-hidden="true" /> {settings ? "Fechar configuração" : "Configurar"}</Button>}
            <Button onClick={() => setOpen("new")}><Plus className="h-4 w-4" aria-hidden="true" /> Novo registro</Button>
          </div>
        </div>

        {settings && table && isAdmin && <TableSettings table={table} />}

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" label="Carregando" /> Carregando…</div>
        ) : !visible.length ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">{q ? "Nada encontrado." : "Nenhum registro ainda."}</p>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-surface text-xs uppercase tracking-wide text-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 font-semibold">{titleCol?.label ?? "Nome"}</th>
                  {others.map((c) => <th key={c.id} scope="col" className="whitespace-nowrap px-3 py-2 font-semibold">{c.label}</th>)}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visible.map((r) => (
                  <tr key={r.id} className="cursor-pointer hover:bg-surface" onClick={() => setOpen(r)}>
                    <td className="px-3 py-2 font-medium text-text">
                      <button className="text-left hover:text-accent" onClick={(e) => { e.stopPropagation(); setOpen(r); }}>{r.title}</button>
                    </td>
                    {others.map((c) => <td key={c.id} className="max-w-64 truncate px-3 py-2 text-muted">{text(r, c)}</td>)}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {!!records?.length && <p className="text-xs text-muted">{visible.length} de {records.length} registro(s)</p>}
      </div>

      <RecordModal tableId={tableId} columns={cols} record={open} onClose={() => setOpen(null)} />
    </AppShell>
  );
}

/** Admins: identity, title/summary columns, the columns themselves, delete. */
function TableSettings({ table }: { table: DataTable }) {
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<FieldDef | "new" | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [form, setForm] = useState({ name: table.name, description: table.description ?? "", icon: table.icon ?? "" });
  const { data: all } = useQuery({ queryKey: ["dbColumns", table.id, "all"], queryFn: () => api.database.columns(table.id, true) });
  const active = (all ?? []).filter((c) => !c.archivedAt);
  const archived = (all ?? []).filter((c) => c.archivedAt);

  const done = () => {
    qc.invalidateQueries({ queryKey: ["database", table.id] });
    qc.invalidateQueries({ queryKey: ["databases"] });
    qc.invalidateQueries({ queryKey: ["dbColumns", table.id] });
    qc.invalidateQueries({ queryKey: ["dbRecords", table.id] });
  };
  const onError = (e: unknown) => toast(errMsg(e), "error");
  const update = useMutation({ mutationFn: api.database.update, onSuccess: done, onError });
  const reorder = useMutation({ mutationFn: (ids: string[]) => api.database.reorderColumns(table.id, ids), onSuccess: done, onError });
  const archive = useMutation({ mutationFn: (p: { id: string; archived: boolean }) => api.database.archiveColumn(p.id, p.archived), onSuccess: done, onError });
  const removeCol = useMutation({ mutationFn: api.database.removeColumn, onSuccess: done, onError });
  const removeTable = useMutation({ mutationFn: () => api.database.remove(table.id), onSuccess: () => { done(); navigate("/databases"); }, onError });

  const saveText = (key: "name" | "description" | "icon") => {
    const v = form[key].trim();
    const before = key === "name" ? table.name : table[key] ?? "";
    if (key === "name" && !v) { setForm((f) => ({ ...f, name: table.name })); return; }
    if (v !== before) update.mutate({ tableId: table.id, [key]: key === "name" ? v : v || null });
  };
  const bind = (key: "name" | "description" | "icon") => ({
    value: form[key], onBlur: () => saveText(key),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
  });
  const swap = (i: number, dir: -1 | 1) => { const ids = active.map((c) => c.id); [ids[i], ids[i + dir]] = [ids[i + dir], ids[i]]; reorder.mutate(ids); };
  const toggleSummary = (id: string, on: boolean) => {
    const next = on ? [...table.summaryFieldIds, id] : table.summaryFieldIds.filter((x) => x !== id);
    if (next.length > 5) { toast("No máximo 5 colunas no resumo", "error"); return; }
    update.mutate({ tableId: table.id, summaryFieldIds: next });
  };

  return (
    <section aria-label="Configuração do database" className="flex flex-col gap-5 rounded-lg border border-border bg-bg p-4">
      <div className="grid gap-4 sm:grid-cols-[6rem_minmax(0,1fr)_12rem]">
        <div className="flex flex-col gap-1.5"><label htmlFor="db-icon" className="text-sm font-medium text-text">Ícone</label><Input id="db-icon" {...bind("icon")} placeholder="🏢" maxLength={8} className="text-center text-lg" /></div>
        <div className="flex flex-col gap-1.5"><label htmlFor="db-name-edit" className="text-sm font-medium text-text">Nome</label><Input id="db-name-edit" {...bind("name")} /></div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="db-color" className="text-sm font-medium text-text">Cor</label>
          <Select id="db-color" value={table.color ?? undefined} placeholder="Sem cor" onValueChange={(c) => update.mutate({ tableId: table.id, color: c as PhaseColor })}
            options={PHASE_COLORS.map((c) => ({ value: c, label: COLOR_LABEL[c] }))} />
        </div>
      </div>
      <div className="flex flex-col gap-1.5"><label htmlFor="db-description" className="text-sm font-medium text-text">Descrição</label><Input id="db-description" {...bind("description")} /></div>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="db-title" className="text-sm font-medium text-text">Coluna de título (nomeia cada registro)</label>
        <Select id="db-title" value={table.titleFieldId ?? undefined} onValueChange={(id) => update.mutate({ tableId: table.id, titleFieldId: id })}
          options={active.filter((c) => TITLE_TYPES.includes(c.type)).map((c) => ({ value: c.id, label: c.label }))} />
      </div>
      <fieldset className="flex flex-col gap-1.5">
        <legend className="text-sm font-medium text-text">Resumo nas conexões <span className="text-muted">(até 5 colunas mostradas quando um card conecta um registro)</span></legend>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {active.filter((c) => c.id !== table.titleFieldId).map((c) => (
            <label key={c.id} className="inline-flex items-center gap-2 text-sm text-text">
              <input type="checkbox" className="h-4 w-4 accent-accent" checked={table.summaryFieldIds.includes(c.id)} onChange={(e) => toggleSummary(c.id, e.target.checked)} />{c.label}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-text">Colunas</h3>
          <Button size="sm" onClick={() => setEditing("new")}><Plus className="h-4 w-4" aria-hidden="true" /> Nova coluna</Button>
        </div>
        <ol className="flex flex-col divide-y divide-border rounded-md border border-border">
          {active.map((c, i) => (
            <li key={c.id} className="flex items-center gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text">{c.label}{c.required && <span className="ml-1 text-danger" title="Obrigatório">*</span>}{c.id === table.titleFieldId && <span className="ml-2 text-xs text-muted">(título)</span>}</p>
                <p className="text-xs text-muted">{TYPE_LABEL[c.type] ?? c.type}{c.isUnique ? " · valor único" : ""}</p>
              </div>
              <button aria-label={`Subir ${c.label}`} disabled={i === 0} onClick={() => swap(i, -1)} className="rounded p-1 text-muted hover:bg-surface disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
              <button aria-label={`Descer ${c.label}`} disabled={i === active.length - 1} onClick={() => swap(i, 1)} className="rounded p-1 text-muted hover:bg-surface disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
              <button aria-label={`Editar ${c.label}`} onClick={() => setEditing(c)} className="rounded p-1 text-muted hover:bg-surface"><Pencil className="h-4 w-4" /></button>
              {c.id !== table.titleFieldId && (
                <>
                  <button aria-label={`Arquivar ${c.label}`} title="Arquivar (mantém os valores)" onClick={() => archive.mutate({ id: c.id, archived: true })} className="rounded p-1 text-muted hover:bg-surface"><Archive className="h-4 w-4" /></button>
                  <button aria-label={`Excluir ${c.label}`} onClick={() => { if (confirm(`Excluir a coluna "${c.label}" e os valores dela em todos os registros?`)) removeCol.mutate(c.id); }} className="rounded p-1 text-muted hover:bg-surface hover:text-danger"><Trash2 className="h-4 w-4" /></button>
                </>
              )}
            </li>
          ))}
        </ol>
        {archived.length > 0 && (
          <div className="flex flex-col gap-1">
            <button className="self-start text-xs text-accent" onClick={() => setShowArchived((s) => !s)}>{showArchived ? "Ocultar" : "Mostrar"} colunas arquivadas ({archived.length})</button>
            {showArchived && archived.map((c) => (
              <div key={c.id} className="flex items-center gap-2 px-3 py-1 text-sm text-muted">
                <span className="flex-1">{c.label}</span>
                <Button size="sm" variant="secondary" onClick={() => archive.mutate({ id: c.id, archived: false })}><ArchiveRestore className="h-4 w-4" aria-hidden="true" /> Restaurar</Button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="border-t border-border pt-3">
        <Button variant="danger" size="sm" loading={removeTable.isPending}
          onClick={() => { if (prompt(`Para excluir, digite o nome do database: ${table.name}`)?.trim() === table.name) removeTable.mutate(); }}>
          <Trash2 className="h-4 w-4" aria-hidden="true" /> Excluir database
        </Button>
      </div>

      <FieldEditorModal field={editing} onClose={() => setEditing(null)} onSaved={done} types={DB_COLUMN_TYPES} phaseOptions={false} noun="coluna"
        save={(d, existing) => existing
          ? api.database.updateColumn({ fieldId: existing.id, label: d.label, required: d.required, options: d.options, description: d.description, help: d.help, isUnique: d.isUnique, validationRegex: d.validationRegex })
          : api.database.createColumn({ tableId: table.id, label: d.label, type: d.type, required: d.required, options: d.options, description: d.description, help: d.help, isUnique: d.isUnique, validationRegex: d.validationRegex })} />
    </section>
  );
}
