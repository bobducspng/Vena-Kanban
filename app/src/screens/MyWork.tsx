import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlarmClock, CalendarClock, CheckCircle2, Clock, Inbox } from "lucide-react";
import { api } from "../data/store";
import type { MyWorkCard } from "../data/types";
import { AppShell } from "../components/app/AppShell";
import { Spinner } from "../components/ui/Spinner";

const SOON_MS = 2 * 86_400_000;

/** S-extra — "Meu trabalho": my cards across pipes, by urgency (as in the original). */
export function MyWork() {
  const { data, isLoading } = useQuery({ queryKey: ["myWork"], queryFn: api.card.myWork, refetchInterval: 60_000 });
  const now = Date.now();
  const open = (data ?? []).filter((c) => !c.done);
  const groups: { key: string; title: string; icon: typeof Clock; tone: string; cards: MyWorkCard[] }[] = [
    { key: "overdue", title: "Vencidos", icon: AlarmClock, tone: "text-danger", cards: open.filter((c) => c.overdueAt) },
    { key: "expired", title: "Expirados", icon: AlarmClock, tone: "text-danger", cards: open.filter((c) => c.expiredAt && !c.overdueAt) },
    { key: "late", title: "Atrasados na fase", icon: Clock, tone: "text-warning", cards: open.filter((c) => c.lateAt && !c.expiredAt && !c.overdueAt) },
    { key: "soon", title: "Vencem em até 2 dias", icon: CalendarClock, tone: "text-warning",
      cards: open.filter((c) => !c.overdueAt && !c.expiredAt && !c.lateAt && c.dueDate && new Date(c.dueDate).getTime() - now <= SOON_MS) },
    { key: "rest", title: "Em andamento", icon: Inbox, tone: "text-muted",
      cards: open.filter((c) => !c.overdueAt && !c.expiredAt && !c.lateAt && !(c.dueDate && new Date(c.dueDate).getTime() - now <= SOON_MS)) },
    { key: "done", title: "Concluídos (últimos 30 dias)", icon: CheckCircle2, tone: "text-success",
      cards: (data ?? []).filter((c) => c.done && now - new Date(c.updatedAt).getTime() <= 30 * 86_400_000) },
  ];

  return (
    <AppShell title="Meu trabalho">
      <div className="mx-auto flex max-w-content flex-col gap-5 p-6">
        <div>
          <h2 className="text-xl text-text">Meu trabalho</h2>
          <p className="text-sm text-muted">Todos os cards em que você é responsável, em todos os pipes.</p>
        </div>
        {isLoading ? <Spinner className="h-4 w-4" label="Carregando" /> : !data?.length ? (
          <p className="rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted">Você não é responsável por nenhum card.</p>
        ) : groups.filter((g) => g.cards.length).map((g) => (
          <section key={g.key} aria-label={g.title} className="flex flex-col gap-2">
            <h3 className={`inline-flex items-center gap-1.5 text-sm font-semibold ${g.tone}`}><g.icon className="h-4 w-4" aria-hidden="true" />{g.title} ({g.cards.length})</h3>
            <ul className="flex flex-col divide-y divide-border rounded-lg border border-border">
              {g.cards.map((c) => (
                <li key={c.id}>
                  <Link to={`/pipes/${c.pipeId}?card=${c.id}`} className="grid gap-1 px-4 py-2.5 hover:bg-surface sm:grid-cols-[minmax(0,1fr)_12rem_10rem_8rem] sm:items-center">
                    <span className="truncate text-sm text-text"><span className="text-muted">#{c.number}</span> {c.title}</span>
                    <span className="truncate text-xs text-muted">{c.pipeIcon && <span aria-hidden="true">{c.pipeIcon} </span>}{c.pipeName}</span>
                    <span className="truncate text-xs text-muted">{c.phaseName}</span>
                    <span className="text-xs text-muted">{c.dueDate ? `vence ${new Date(c.dueDate).toLocaleDateString("pt-BR")}` : ""}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </AppShell>
  );
}
