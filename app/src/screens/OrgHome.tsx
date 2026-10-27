import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, LayoutGrid } from "lucide-react";
import { api } from "../data/store";
import { AppShell } from "../components/app/AppShell";
import { Button } from "../components/ui/Button";
import { Modal } from "../components/ui/Modal";
import { Input } from "../components/ui/Input";
import { Spinner } from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";

/** S02 — organization home: the list of pipes, and creating one. */
export function OrgHome() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");

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
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Novo pipe
          </Button>
        </div>

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted">
            <Spinner className="h-4 w-4" label="Carregando pipes" /> Carregando…
          </div>
        ) : !pipes || pipes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border-input p-12 text-center">
            <LayoutGrid className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
            <p className="mt-3 text-sm font-medium text-text">Nenhum pipe ainda</p>
            <p className="mt-1 text-sm text-muted">Crie seu primeiro processo para começar.</p>
            <Button className="mt-4" onClick={() => setOpen(true)}>Criar pipe</Button>
          </div>
        ) : (
          <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pipes.map((p) => (
              <li key={p.id}>
                <button
                  onClick={() => navigate(`/pipes/${p.id}`)}
                  className="flex w-full flex-col items-start rounded-lg border border-border bg-surface-raised p-4 text-left shadow-card hover:border-accent"
                >
                  <span className="text-base font-semibold text-text">{p.name}</span>
                  {p.description && <span className="mt-1 text-sm text-muted">{p.description}</span>}
                </button>
              </li>
            ))}
          </ul>
        )}
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
