import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api } from "../data/store";
import type { Card } from "../data/types";
import { cn } from "../lib/cn";
import { AppShell } from "../components/app/AppShell";
import { PipeTabs } from "../components/app/PipeTabs";
import { CardDetailModal } from "../components/app/CardDetailModal";
import { Button } from "../components/ui/Button";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";

const WEEK = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DUE = "__due", CREATED = "__created";
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const STORE = (pipeId: string) => `venaflow.calendar.${pipeId}`;
const readPref = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const writePref = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* private mode */ } };

/** Calendário: the cards of the pipe on a month grid, by vencimento or any date field. */
export function PipeCalendar() {
  const { pipeId = "" } = useParams();
  const [month, setMonth] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [by, setByState] = useState(() => readPref(STORE(pipeId)) ?? DUE);
  const [activeId, setActiveId] = useState<string | null>(null);
  const setBy = (v: string) => { setByState(v); writePref(STORE(pipeId), v); };

  const { data: pipe } = useQuery({ queryKey: ["pipe", pipeId], queryFn: () => api.pipe.get(pipeId) });
  const { data: phases } = useQuery({ queryKey: ["phases", pipeId], queryFn: () => api.phase.listByPipe(pipeId) });
  const { data: fields } = useQuery({ queryKey: ["fields", pipeId], queryFn: () => api.field.listByPipe(pipeId) });
  const { data: cards, isLoading } = useQuery({ queryKey: ["cards", pipeId], queryFn: () => api.card.listByPipe(pipeId) });

  const dateFields = (fields ?? []).filter((f) => ["date", "datetime"].includes(f.type) && !f.archivedAt);
  const phaseOf = (c: Card) => phases?.find((p) => p.id === c.currentPhaseId);
  /** "YYYY-MM-DD" the card sits on, for the chosen date. */
  const dayOf = (c: Card): string | null => {
    if (by === DUE) return c.dueDate ? ymd(new Date(c.dueDate)) : null;
    if (by === CREATED) return ymd(new Date(c.createdAt));
    const v = c.values.find((x) => x.fieldId === by)?.value;
    return typeof v === "string" && v.length >= 10 ? v.slice(0, 10) : null;
  };
  const byDay = new Map<string, Card[]>();
  for (const c of cards ?? []) {
    const d = dayOf(c);
    if (d) byDay.set(d, [...(byDay.get(d) ?? []), c]);
  }
  const undated = (cards ?? []).filter((c) => !dayOf(c) && !c.done).length;

  // Six weeks starting on the Sunday before the 1st.
  const first = new Date(month.getFullYear(), month.getMonth(), 1 - month.getDay());
  const days = Array.from({ length: 42 }, (_, i) => new Date(first.getFullYear(), first.getMonth(), first.getDate() + i));
  const today = ymd(new Date());
  const shift = (n: number) => setMonth((m) => new Date(m.getFullYear(), m.getMonth() + n, 1));

  return (
    <AppShell title={pipe ? `${pipe.name} · Calendário` : "Calendário"}>
      <div className="flex flex-col gap-3 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <Link to="/" className="text-xs text-muted hover:text-accent">← Pipes</Link>
            <h2 className="truncate text-lg text-text">{pipe?.icon && <span className="mr-1.5" aria-hidden="true">{pipe.icon}</span>}{pipe?.name ?? "…"}</h2>
            <PipeTabs pipeId={pipeId} />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-56">
              <Select aria-label="Data usada" value={by} onValueChange={setBy}
                options={[{ value: DUE, label: "Vencimento do card" }, { value: CREATED, label: "Criação do card" }, ...dateFields.map((f) => ({ value: f.id, label: `Campo: ${f.label}` }))]} />
            </div>
            <Button variant="secondary" size="sm" aria-label="Mês anterior" onClick={() => shift(-1)}><ChevronLeft className="h-4 w-4" /></Button>
            <span className="w-36 text-center text-sm font-medium capitalize text-text">{month.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</span>
            <Button variant="secondary" size="sm" aria-label="Próximo mês" onClick={() => shift(1)}><ChevronRight className="h-4 w-4" /></Button>
            <Button variant="ghost" size="sm" onClick={() => { const d = new Date(); setMonth(new Date(d.getFullYear(), d.getMonth(), 1)); }}>Hoje</Button>
          </div>
        </div>
        {undated > 0 && <p className="text-xs text-muted">{undated} card(s) em aberto sem essa data não aparecem no calendário.</p>}

        {isLoading ? <Spinner className="h-5 w-5" label="Carregando" /> : (
          <div className="overflow-x-auto">
            <div className="grid min-w-[44rem] grid-cols-7 overflow-hidden rounded-lg border border-border">
              {WEEK.map((w) => <div key={w} className="border-b border-border bg-surface px-2 py-1 text-xs font-semibold text-muted">{w}</div>)}
              {days.map((d) => {
                const key = ymd(d);
                const list = byDay.get(key) ?? [];
                const out = d.getMonth() !== month.getMonth();
                return (
                  <div key={key} className={cn("flex min-h-28 flex-col gap-1 border-b border-r border-border p-1", out && "bg-surface/60")}>
                    <span className={cn("self-end rounded-pill px-1.5 text-xs", key === today ? "bg-accent font-semibold text-on-accent" : out ? "text-muted" : "text-text")}>{d.getDate()}</span>
                    {list.slice(0, 4).map((c) => {
                      const late = !c.done && by === DUE && key < today;
                      return (
                        <button key={c.id} onClick={() => setActiveId(c.id)} title={`#${c.number} ${c.title} · ${phaseOf(c)?.name ?? ""}`}
                          className={cn("truncate rounded border-l-2 bg-bg px-1.5 py-0.5 text-left text-xs hover:bg-surface",
                            c.done ? "border-success text-muted line-through" : late ? "border-danger text-text" : "border-accent text-text")}>
                          <span className="text-muted">#{c.number}</span> {c.title}
                        </button>
                      );
                    })}
                    {list.length > 4 && <span className="px-1 text-xs text-muted">+{list.length - 4} card(s)</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <p className="text-xs text-muted">Borda vermelha = vencido; riscado = concluído. Clique no card para abrir.</p>
      </div>
      <CardDetailModal cardId={activeId} pipeId={pipeId} open={!!activeId} onOpenChange={(o) => !o && setActiveId(null)} />
    </AppShell>
  );
}
