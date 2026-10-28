import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Plus, Settings, Search } from "lucide-react";
import { api } from "../data/store";
import { AppShell } from "../components/app/AppShell";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Spinner } from "../components/ui/Spinner";
import { Tag } from "../components/ui/Tag";
import { Avatar } from "../components/ui/Avatar";
import { StartFormModal } from "../components/app/StartFormModal";
import { CardDetailModal } from "../components/app/CardDetailModal";

/** S03 — kanban: phases as columns, cards as tiles. Add via start form, open to move. */
export function PipeKanban() {
  const { pipeId = "" } = useParams();
  const [startOpen, setStartOpen] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const { data: pipe } = useQuery({ queryKey: ["pipe", pipeId], queryFn: () => api.pipe.get(pipeId) });
  const { data: phases, isLoading: lp } = useQuery({ queryKey: ["phases", pipeId], queryFn: () => api.phase.listByPipe(pipeId) });
  const { data: cards, isLoading: lc } = useQuery({ queryKey: ["cards", pipeId], queryFn: () => api.card.listByPipe(pipeId) });
  // Real org members, to resolve assignee avatars (BUG-004).
  const { data: members } = useQuery({ queryKey: ["users"], queryFn: api.user.list });
  const userById = new Map((members ?? []).map((u) => [u.id, u]));

  const loading = lp || lc;
  // Search by card number ("1042" or "#1042") or by title.
  const q = query.trim().toLowerCase().replace(/^#/, "");
  const visible = (cards ?? []).filter((c) => !q || String(c.number) === q || c.title.toLowerCase().includes(q));

  return (
    <AppShell title={pipe?.name ?? "Pipe"}>
      <div className="flex h-full flex-col">
        <div className="flex items-center justify-between gap-4 p-4">
          <div className="min-w-0">
            <Link to="/" className="text-xs text-muted hover:text-accent">← Pipes</Link>
            <h2 className="truncate text-lg text-text">{pipe?.name ?? "…"}</h2>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative hidden sm:block">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
              <Input aria-label="Buscar card por número ou título" placeholder="Buscar #ID ou título" value={query} onChange={(e) => setQuery(e.target.value)} className="w-56 pl-8" />
            </div>
            <Link to={`/pipes/${pipeId}/settings`} className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-4 text-sm text-text hover:bg-bg">
              <Settings className="h-4 w-4" aria-hidden="true" /> Configurar
            </Link>
            <Button onClick={() => setStartOpen(true)}>
              <Plus className="h-4 w-4" aria-hidden="true" /> Novo card
            </Button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 p-4 text-sm text-muted">
            <Spinner className="h-4 w-4" label="Carregando quadro" /> Carregando quadro…
          </div>
        ) : (
          <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto p-4">
            {phases?.map((phase) => {
              const phaseCards = visible.filter((c) => c.currentPhaseId === phase.id);
              return (
                <section
                  key={phase.id}
                  aria-label={phase.name}
                  className="flex w-kanban-column shrink-0 flex-col rounded-lg bg-surface"
                >
                  <div className="flex items-center justify-between gap-2 px-3 py-2.5">
                    <Tag color={phase.color}>{phase.name}</Tag>
                    <span className="text-xs text-muted">{phaseCards.length}</span>
                  </div>
                  <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
                    {phaseCards.length === 0 ? (
                      <li className="px-2 py-6 text-center text-xs text-muted">Sem cards</li>
                    ) : (
                      phaseCards.map((card) => (
                        <li key={card.id}>
                          <button
                            onClick={() => setActiveId(card.id)}
                            className="flex w-full flex-col items-start gap-2 rounded-md border border-border bg-surface-raised p-3 text-left shadow-card hover:border-accent"
                          >
                            <span className="text-xs text-muted">#{card.number}</span>
                            <span className="text-sm font-semibold text-text">{card.title}</span>
                            <div className="flex w-full items-center justify-between">
                              <span className="text-xs text-muted">
                                {new Date(card.createdAt).toLocaleDateString("pt-BR")}
                              </span>
                              <div className="flex -space-x-1">
                                {card.assigneeIds.map((uid) => {
                                  const u = userById.get(uid);
                                  return (
                                    <Avatar
                                      key={uid}
                                      name={u?.name ?? "Usuário"}
                                      color={u?.avatarColor}
                                      size="sm"
                                    />
                                  );
                                })}
                              </div>
                            </div>
                          </button>
                        </li>
                      ))
                    )}
                  </ul>
                </section>
              );
            })}
          </div>
        )}
      </div>

      <StartFormModal pipeId={pipeId} open={startOpen} onOpenChange={setStartOpen} />
      <CardDetailModal cardId={activeId} pipeId={pipeId} open={!!activeId} onOpenChange={(o) => !o && setActiveId(null)} />
    </AppShell>
  );
}
