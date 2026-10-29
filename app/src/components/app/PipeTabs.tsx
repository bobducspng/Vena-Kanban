import { NavLink } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../data/store";
import { BarChart3, Columns3, List, Workflow } from "lucide-react";
import { cn } from "../../lib/cn";

const SHOW_DASHBOARD = true;

/** Views of a pipe: Quadro (kanban), Lista (table), Dashboard. */
export function PipeTabs({ pipeId }: { pipeId: string }) {
  const { data: pipe } = useQuery({ queryKey: ["pipe", pipeId], queryFn: () => api.pipe.get(pipeId) });
  // The dashboard counts every card, so "só os meus cards" does not get it.
  const dashboard = SHOW_DASHBOARD && pipe?.myRole !== "my_cards";
  const tabs = [
    { to: `/pipes/${pipeId}`, label: "Quadro", icon: Columns3, end: true },
    { to: `/pipes/${pipeId}/list`, label: "Lista", icon: List, end: true },
    // Dashboard tab arrives with M9b.
    ...(dashboard ? [{ to: `/pipes/${pipeId}/dashboard`, label: "Dashboard", icon: BarChart3, end: true }] : []),
    { to: `/pipes/${pipeId}/flow`, label: "Flow", icon: Workflow, end: true },
  ];
  return (
    <nav aria-label="Visões do pipe" className="flex gap-1">
      {tabs.map(({ to, label, icon: Icon, end }) => (
        <NavLink key={to} to={to} end={end}
          className={({ isActive }) => cn("inline-flex items-center gap-1.5 rounded-md px-2.5 py-1 text-sm", isActive ? "bg-surface font-semibold text-accent" : "text-muted hover:text-text")}>
          <Icon className="h-4 w-4" aria-hidden="true" /> {label}
        </NavLink>
      ))}
    </nav>
  );
}
