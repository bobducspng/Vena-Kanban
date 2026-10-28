import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link2, Plus, Search, X } from "lucide-react";
import { api } from "../../data/store";
import type { FieldDef } from "../../data/types";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { RecordModal } from "./RecordModal";
import { StartFormModal } from "./StartFormModal";

/** "Conexão" value editor: connected items (title + summary), search to connect,
 *  create a new record/card and connect it. Value = list of ids. */
export function ConnectionInput({ def, value, onChange, disabled }: {
  def: FieldDef; value: string[]; onChange: (ids: string[]) => void; disabled?: boolean;
}) {
  const s = def.settings;
  const [searching, setSearching] = useState(false);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);

  const { data: items } = useQuery({
    queryKey: ["connected", def.id, value],
    queryFn: () => api.connection.describe(def.id, value),
    enabled: value.length > 0,
  });
  const { data: results } = useQuery({
    queryKey: ["connSearch", def.id, q],
    queryFn: () => api.connection.search(def.id, q),
    enabled: searching,
  });
  const { data: columns } = useQuery({
    queryKey: ["dbColumns", s?.targetId],
    queryFn: () => api.database.columns(s!.targetId),
    enabled: creating && s?.target === "table",
  });

  if (!s) return <p className="text-sm text-danger">Conexão sem configuração.</p>;
  const full = !s.multiple && value.length >= 1;
  const add = (id: string) => { onChange(s.multiple ? [...new Set([...value, id])] : [id]); setSearching(false); setQ(""); };
  const noun = s.target === "table" ? "registro" : "card";

  return (
    <div className="flex flex-col gap-2">
      {value.length > 0 && (
        <ul className="flex flex-col gap-1.5">
          {(items ?? value.map((id) => ({ id, title: "…", details: [] as string[], number: undefined as number | undefined }))).map((it) => (
            <li key={it.id} className="flex items-start gap-2 rounded-md border border-border bg-surface px-3 py-2">
              <Link2 className="mt-0.5 h-4 w-4 shrink-0 text-muted" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-text">{it.number ? `#${it.number} · ` : ""}{it.title}</p>
                {it.details.map((d) => <p key={d} className="truncate text-xs text-muted">{d}</p>)}
              </div>
              {!disabled && (
                <button type="button" aria-label={`Desconectar ${it.title}`} onClick={() => onChange(value.filter((x) => x !== it.id))} className="rounded p-0.5 text-muted hover:text-danger">
                  <X className="h-4 w-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}

      {!disabled && !full && (
        <div className="flex flex-wrap gap-2">
          {s.canSearch && (
            <Button type="button" size="sm" variant="secondary" onClick={() => setSearching((o) => !o)}>
              <Search className="h-4 w-4" aria-hidden="true" /> Conectar {noun} existente
            </Button>
          )}
          {s.canCreate && (
            <Button type="button" size="sm" variant="secondary" onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Criar novo {noun}
            </Button>
          )}
        </div>
      )}

      {searching && (
        <div className="flex flex-col gap-1 rounded-md border border-border p-2">
          <Input autoFocus aria-label={`Buscar ${noun}`} placeholder={s.target === "pipe" ? "Título ou #número" : "Buscar pelo nome"} value={q} onChange={(e) => setQ(e.target.value)} />
          <ul className="flex max-h-56 flex-col overflow-y-auto">
            {(results ?? []).filter((r) => !value.includes(r.id)).map((r) => (
              <li key={r.id}>
                <button type="button" onClick={() => add(r.id)} className="flex w-full flex-col items-start rounded-sm px-2 py-1.5 text-left hover:bg-surface">
                  <span className="text-sm text-text">{r.number ? `#${r.number} · ` : ""}{r.title}</span>
                  {r.details[0] && <span className="text-xs text-muted">{r.details.join(" · ")}</span>}
                </button>
              </li>
            ))}
            {results && results.filter((r) => !value.includes(r.id)).length === 0 && <li className="px-2 py-1.5 text-sm text-muted">Nada encontrado.</li>}
          </ul>
        </div>
      )}

      {creating && s.target === "table" && (
        <RecordModal tableId={s.targetId} columns={columns ?? []} record="new" onClose={() => setCreating(false)} onCreated={(r) => add(r.id)} />
      )}
      {s.target === "pipe" && (
        <StartFormModal pipeId={s.targetId} open={creating} onOpenChange={setCreating} onCreated={(c) => add(c.id)} />
      )}
    </div>
  );
}
