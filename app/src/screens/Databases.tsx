import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Database, Plus } from "lucide-react";
import { api } from "../data/store";
import { useMe } from "../lib/useMe";
import { AppShell } from "../components/app/AppShell";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Modal } from "../components/ui/Modal";
import { Spinner } from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";

const STRIPE: Record<string, string> = {
  gray: "border-l-label-gray", red: "border-l-label-red", orange: "border-l-label-orange", amber: "border-l-label-amber",
  green: "border-l-label-green", teal: "border-l-label-teal", blue: "border-l-label-blue", purple: "border-l-label-purple", pink: "border-l-label-pink",
};

/** S13 — databases of the organisation (cadastros: fornecedores, clientes, centros de custo…). */
export function Databases() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { isAdmin } = useMe();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const { data: tables, isLoading } = useQuery({ queryKey: ["databases"], queryFn: api.database.list });
  const { data: deleted } = useQuery({ queryKey: ["databases", "deleted"], queryFn: api.database.listDeleted, enabled: isAdmin });

  const create = useMutation({
    mutationFn: () => api.database.create(name.trim()),
    onSuccess: (t) => { qc.invalidateQueries({ queryKey: ["databases"] }); setOpen(false); setName(""); navigate(`/databases/${t.id}`); },
    onError: (e) => toast(e instanceof Error ? e.message : "Não foi possível criar", "error"),
  });
  const restore = useMutation({
    mutationFn: api.database.restore,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["databases"] }); toast("Database restaurado", "success"); },
  });

  return (
    <AppShell title="Bancos de dados">
      <div className="mx-auto max-w-content p-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl text-text">Bancos de dados</h2>
            <p className="text-sm text-muted">Cadastros da empresa que os cards consultam e conectam (fornecedores, clientes, centros de custo…).</p>
          </div>
          {isAdmin && <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" aria-hidden="true" /> Novo database</Button>}
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted"><Spinner className="h-4 w-4" label="Carregando" /> Carregando…</div>
        ) : !tables?.length ? (
          <div className="rounded-lg border border-dashed border-border-input p-12 text-center">
            <Database className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-text">Nenhum database ainda</p>
            <p className="mt-1 text-sm text-muted">{isAdmin ? "Crie o primeiro cadastro, por exemplo Fornecedores." : "Peça a um administrador para criar o primeiro cadastro."}</p>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tables.map((t) => (
              <li key={t.id}>
                <button onClick={() => navigate(`/databases/${t.id}`)}
                  className={`flex w-full flex-col items-start rounded-lg border border-l-4 border-border bg-surface-raised p-4 text-left shadow-card hover:border-accent ${STRIPE[t.color ?? ""] ?? ""}`}>
                  <span className="text-base font-semibold text-text">{t.icon && <span className="mr-1.5" aria-hidden="true">{t.icon}</span>}{t.name}</span>
                  {t.description && <span className="mt-1 text-sm text-muted">{t.description}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}

        {isAdmin && !!deleted?.length && (
          <details className="mt-8 text-sm">
            <summary className="cursor-pointer text-muted">Databases excluídos ({deleted.length})</summary>
            <ul className="mt-2 flex flex-col divide-y divide-border rounded-md border border-border">
              {deleted.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-3 py-2">
                  <span className="min-w-0 flex-1 truncate text-text">{t.name}</span>
                  <Button size="sm" variant="secondary" loading={restore.isPending} onClick={() => restore.mutate(t.id)}>Restaurar</Button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </div>

      <Modal open={open} onOpenChange={setOpen} title="Novo database" description="Ele nasce com a coluna Nome; você adiciona as outras depois."
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={() => create.mutate()} loading={create.isPending} disabled={!name.trim()}>Criar</Button></>}>
        <form onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(); }} className="flex flex-col gap-1.5">
          <label htmlFor="db-name" className="text-sm font-medium text-text">Nome</label>
          <Input id="db-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Fornecedores" />
        </form>
      </Modal>
    </AppShell>
  );
}
