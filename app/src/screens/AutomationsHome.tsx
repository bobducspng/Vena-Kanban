import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Zap } from "lucide-react";
import { api } from "../data/store";
import { useMe } from "../lib/useMe";
import { AppShell } from "../components/app/AppShell";

/** Sidebar "Automações": automations live per pipe — pick one. */
export function AutomationsHome() {
  const { isAdmin } = useMe();
  const { data: pipes } = useQuery({ queryKey: ["pipes"], queryFn: api.pipe.list });
  return (
    <AppShell title="Automações">
      <div className="mx-auto max-w-content p-6">
        <h2 className="text-xl text-text">Automações</h2>
        <p className="mb-6 text-sm text-muted">{isAdmin ? "Cada pipe tem as suas. Escolha um:" : "Só administradores configuram automações."}</p>
        {isAdmin && (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {(pipes ?? []).map((p) => (
              <li key={p.id}>
                <Link to={`/pipes/${p.id}/automations`} className="flex items-center gap-2 rounded-lg border border-border bg-surface-raised p-4 text-sm text-text shadow-card hover:border-accent">
                  <Zap className="h-4 w-4 text-muted" aria-hidden="true" /> {p.icon && <span aria-hidden="true">{p.icon}</span>} {p.name}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
