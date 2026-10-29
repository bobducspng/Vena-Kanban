import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, LayoutGrid } from "lucide-react";
import { api } from "../data/store";
import { useMe } from "../lib/useMe";
import { AppShell } from "../components/app/AppShell";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Input } from "../components/ui/Input";
import { Spinner } from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";

/** S02 — organization home: the list of pipes, and creating one. */
// Left stripe colour of a pipe tile.
const STRIPE: Record<string, string> = {
  gray: "border-l-label-gray", red: "border-l-label-red", orange: "border-l-label-orange", amber: "border-l-label-amber",
  green: "border-l-label-green", teal: "border-l-label-teal", blue: "border-l-label-blue", purple: "border-l-label-purple", pink: "border-l-label-pink",
};

/** Pipes grouped by pasta (alphabetical); pipes without one come first, untitled. */
function byFolder<T extends { folder?: string | null; name: string }>(list: T[]): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const p of [...list].sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))) {
    const k = p.folder ?? "";
    groups.set(k, [...(groups.get(k) ?? []), p]);
  }
  return [...groups.entries()].sort(([a], [b]) => (a === "" ? -1 : b === "" ? 1 : a.localeCompare(b, "pt-BR")));
}

export function OrgHome() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const { isAdmin } = useMe(); // only admins configure pipes

  const { data: pipes, isLoading } = useQuery({ queryKey: ["pipes"], queryFn: api.pipe.list });

  const create = useMutation({
    mutationFn: () => api.pipe.create({ name: name.trim() }),
    onSuccess: (pipe) => {
      qc.invalidateQueries({ queryKey: ["pipes"] });
      setOpen(false);
      setName("");
      toast(`Pipe "${pipe.name}" criado`, "success");
      navigate(`/pipes/${pipe.id}`);
    },
  });

  return (
    <AppShell title="Pipes">
      <div className="mx-auto max-w-content p-6">
        <div className="mb-6 flex items-center justify-between">
          <h2 className="text-xl text-text">Seus pipes</h2>
          {isAdmin && (
            <Button onClick={() => setOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Novo pipe
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Spinner className="h-4 w-4" label="Carregando pipes" /> Carregando…
          </div>
        ) : !pipes || pipes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-input p-12 text-center">
            <LayoutGrid className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-text">{isAdmin ? "Nenhum pipe ainda" : "Você ainda não está em nenhum pipe"}</p>
            <p className="mt-1 text-sm text-muted">
              {isAdmin ? "Crie seu primeiro processo para começar." : "Peça a um administrador para adicionar você aos pipes em que vai trabalhar."}
            </p>
            {isAdmin && <Button className="mt-4" onClick={() => setOpen(true)}>Criar pipe</Button>}
          </div>
        ) : (
          <div className="flex flex-col gap-6">
          {byFolder(pipes).map(([folder, list]) => (
          <section key={folder} aria-label={folder || "Pipes sem pasta"} className="flex flex-col gap-2">
          {folder && <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{folder}</h3>}
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {list.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => navigate(`/pipes/${p.id}`)}
                  className={`flex w-full flex-col items-start rounded-lg border border-l-4 border-border bg-surface-raised p-4 text-left shadow-card hover:border-accent ${STRIPE[p.color ?? ""] ?? ""}`}
                >
                  <span className="text-base font-semibold text-text">{p.icon && <span className="mr-1.5" aria-hidden="true">{p.icon}</span>}{p.name}</span>
                  {p.description && <span className="mt-1 text-sm text-muted">{p.description}</span>}
                </button>
              </li>
            ))}
          </ul>
          </section>
          ))}
          </div>
        )}
        {isAdmin && <DeletedPipes />}
        {isAdmin && <AutomationFailures />}
      </div>

      <Modal
        open={open}
        onOpenChange={setOpen}
        title="Novo pipe"
        description="Dê um nome ao processo. Você poderá ajustar as fases depois."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={() => create.mutate()} loading={create.isPending} disabled={!name.trim()}>
              Criar
            </Button>
          </>
        }
      >
        <form
          onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(); }}
          className="flex flex-col gap-1.5"
        >
          <label htmlFor="pipe-name" className="text-sm font-medium text-text">Nome do pipe</label>
          <Input
            id="pipe-name"
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Ex.: Onboarding de clientes"
          />
        </form>
      </Modal>
    </AppShell>
  );
}

/** Admins: pipes sent to "excluídos", with restore. Hidden when there are none. */
function DeletedPipes() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ["pipes", "deleted"], queryFn: api.pipe.listDeleted });
  const restore = useMutation({
    mutationFn: api.pipe.restore,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pipes"] }); toast("Pipe restaurado", "success"); },
  });
  if (!data?.length) return null;
  return (
    <details className="mt-8 text-sm">
      <summary className="cursor-pointer text-muted">Pipes excluídos ({data.length})</summary>
      <ul className="mt-2 flex flex-col divide-y divide-border rounded-md border border-border">
        {data.map((p) => (
          <li key={p.id} className="flex items-center gap-3 px-3 py-2">
            <span className="min-w-0 flex-1 truncate text-text">{p.name}</span>
            <Button size="sm" variant="secondary" loading={restore.isPending} onClick={() => restore.mutate(p.id)}>Restaurar</Button>
          </li>
        ))}
      </ul>
    </details>
  );
}

/** Admins: automations whose last run failed (the original's most-voted request). */
function AutomationFailures() {
  const { data } = useQuery({ queryKey: ["automationFailures"], queryFn: api.automation.failures, refetchInterval: 60_000 });
  if (!data?.length) return null;
  return (
    <section aria-label="Automações com falha" className="mt-6 rounded-lg border border-danger p-4">
      <h3 className="text-sm font-semibold text-danger">{data.length} automação(ões) com falha na última execução</h3>
      <ul className="mt-2 flex flex-col gap-1 text-sm">
        {data.map((f) => (
          <li key={f.ruleId}>
            <Link to={`/pipes/${f.pipeId}/automations`} className="text-text hover:text-accent">
              <span className="font-medium">{f.pipeName}</span> · {f.name}: <span className="text-muted">{f.lastError}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
