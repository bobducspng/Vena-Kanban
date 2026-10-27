import { NavLink } from "react-router-dom";
import { LayoutGrid, Database, BarChart3, Zap, Settings, Component } from "lucide-react";
import { cn } from "../../lib/cn";

const nav = [
  { to: "/", label: "Pipes", icon: LayoutGrid, end: true },
  { to: "/databases", label: "Bancos de dados", icon: Database },
  { to: "/reports", label: "Relatórios", icon: BarChart3 },
  { to: "/automations", label: "Automações", icon: Zap },
  { to: "/settings", label: "Configurações", icon: Settings },
  { to: "/design", label: "Design system", icon: Component },
];

export function Sidebar() {
  return (
    <nav aria-label="Navegação principal" className="flex h-full w-sidebar shrink-0 flex-col gap-1 border-r border-border bg-surface p-3">
      <div className="px-2 py-3 text-lg font-bold text-text">Fluxos</div>
      {nav.map(({ to, label, icon: Icon, end }) => (
        <NavLink
          key={to}
          to={to}
          end={end}
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm text-text hover:bg-bg",
              isActive && "bg-bg font-semibold text-accent"
            )
          }
        >
          <Icon className="h-4 w-4" aria-hidden="true" />
          {label}
        </NavLink>
      ))}
    </nav>
  );
}
