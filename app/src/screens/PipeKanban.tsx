import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Settings, Search } from "lucide-react";
import { api, RequiredFieldError } from "../data/store";
import type { Card } from "../data/types";
import { useMe } from "../lib/useMe";
import { isConflict } from "../lib/trpc";
import { cn } from "../lib/cn";
import { AppShell } from "../components/app/AppShell";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Spinner } from "../components/ui/Spinner";
import { Tag } from "../components/ui/Tag";
import { Avatar } from "../components/ui/Avatar";
import { useToast } from "../components/ui/Toast";
import { StartFormModal } from "../components/app/StartFormModal";
import { CardDetailModal } from "../components/app/CardDetailModal";

/** S03 — kanban: phases as columns, cards as tiles. Drag a card to an allowed phase
 *  ("Mover para"), or open it to move with buttons. Add via the start form. */
export function PipeKanban() {
  const { pipeId = "" } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  // null = closed; otherwise the landing phase (undefined = start phase).
  const [startFor, setStartFor] = useState<{ phaseId?: string } | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [dragging, setDragging] = useState<Card | null>(null);
  const [overId, setOverId] = useState<string | null>(null);
  const { isAdmin } = useMe();

  const { data: pipe } = useQuery({ queryKey: ["pipe", pipeId], queryFn: () => api.pipe.get(pipeId) });
  const { data: phases, isLoading: lp } = useQuery({ queryKey: ["phases", pipeId], queryFn: () => api.phase.listByPipe(pipeId) });
  const { data: cards, isLoading: lc } = useQuery({ queryKey: ["cards", pipeId], queryFn: () => api.card.listByPipe(pipeId) });
  // Real org members, to resolve assignee avatars (BUG-004).
  const { data: members } = useQuery({ queryKey: ["users"], queryFn: api.user.list });
  const userById = new Map((members ?? []).map((u) => [u.id, u]));

  // Drop = move, applied optimistically and rolled back if the server refuses.
  const move = useMutation({
    mutationFn: (p: { card: Card; toPhaseId: string }) => api.card.move({ cardId: p.card.id, toPhaseId: p.toPhaseId, version: p.card.version }),
    onMutate: async ({ card, toPhaseId }) => {
      await qc.cancelQueries({ queryKey: ["cards", pipeId] });
      const before = qc.getQueryData<Card[]>(["cards", pipeId]);
      qc.setQueryData<Card[]>(["cards", pipeId], (list) => list?.map((c) => (c.id === card.id ? { ...c, currentPhaseId: toPhaseId } : c)));
      return { before };
    },
    onError: (err, _v, ctx) => {
      if (ctx?.before) qc.setQueryData(["cards", pipeId], ctx.before);
      if (err instanceof RequiredFieldError) toast(err.message, "error");
      else if (isConflict(err)) toast("O card foi alterado por outra pessoa. Recarregado.", "error");
      else toast(err instanceof Error ? err.message : "Não foi possível mover", "error");
    },
    onSettled: (_d, _e, { card }) => {
      qc.invalidateQueries({ queryKey: ["cards", pipeId] });
      qc.invalidateQueries({ queryKey: ["card", card.id] });
      qc.invalidateQueries({ queryKey: ["events", card.id] });
    },
  });

  const loading = lp || lc;
  // Search by card number ("1042" or "#1042") or by title.
  const q = query.trim().toLowerCase().replace(/^#/, "");
  const visible = (cards ?? []).filter((c) => !q || String(c.number) === q || c.title.toLowerCase().includes(q));
  const allowedFromDragged = dragging ? phases?.find((p) => p.id === dragging.currentPhaseId)?.allowedTo ?? [] : [];

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
            {isAdmin && (
              <Link to={`/pipes/${pipeId}/settings`} className="inline-flex h-10 items-center gap-2 rounded-md border border-border bg-surface px-4 text-sm text-text hover:bg-bg">
                <Settings className="h-4 w-4" aria-hidden="true" /> Configurar
              </Link>
            )}
            <Button onClick={() => setStartFor({})}>
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
              const canDrop = !!dragging && allowedFromDragged.includes(phase.id);
              return (
                <section
                  key={phase.id}
                  aria-label={phase.name}
                  onDragOver={(e) => { if (canDrop) { e.preventDefault(); setOverId(phase.id); } }}
                  onDragLeave={() => setOverId((o) => (o === phase.id ? null : o))}
                  onDrop={(e) => {
                    e.preventDefault();
                    if (dragging && canDrop) move.mutate({ card: dragging, toPhaseId: phase.id });
                    setDragging(null); setOverId(null);
                  }}
                  className={cn(
                    "flex w-kanban-column shrink-0 flex-col rounded-lg border-2 border-transparent bg-surface transition-colors",
                    dragging && !canDrop && phase.id !== dragging.currentPhaseId && "opacity-50",
                    canDrop && "border-dashed border-accent",
                    overId === phase.id && "bg-bg"
                  )}
                >
                  <div className="flex flex-col gap-1 px-3 py-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <Tag color={phase.color}>{phase.name}</Tag>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted">{phaseCards.length}</span>
                        {phase.canCreateCard && !phase.isStart && (
                          <button aria-label={`Criar card em ${phase.name}`} onClick={() => setStartFor({ phaseId: phase.id })} className="rounded p-0.5 text-muted hover:bg-bg hover:text-accent">
                            <Plus className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </div>
                    {phase.description && <p className="line-clamp-2 text-xs text-muted" title={phase.description}>{phase.description}</p>}
                  </div>
                  <ul className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-2">
                    {phaseCards.length === 0 ? (
                      <li className="px-2 py-6 text-center text-xs text-muted">{canDrop ? "Solte aqui" : "Sem cards"}</li>
                    ) : (
                      phaseCards.map((card) => (
                        <li key={card.id}>
                          <button
                            draggable
                            onDragStart={(e) => { e.dataTransfer.effectAllowed = "move"; setDragging(card); }}
                            onDragEnd={() => { setDragging(null); setOverId(null); }}
                            onClick={() => setActiveId(card.id)}
                            className={cn(
                              "flex w-full cursor-grab flex-col items-start gap-2 rounded-md border border-border bg-surface-raised p-3 text-left shadow-card hover:border-accent active:cursor-grabbing",
                              dragging?.id === card.id && "opacity-40"
                            )}
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

      <StartFormModal pipeId={pipeId} phaseId={startFor?.phaseId} open={!!startFor} onOpenChange={(o) => !o && setStartFor(null)} />
      <CardDetailModal cardId={activeId} pipeId={pipeId} open={!!activeId} onOpenChange={(o) => !o && setActiveId(null)} />
    </AppShell>
  );
}
