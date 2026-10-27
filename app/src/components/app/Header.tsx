import { Search, LogOut, ChevronDown } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Avatar } from "../ui/Avatar";
import { api } from "../../data/store";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

export function Header({ title }: { title?: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  // Current user — cached by RequireAuth under ["me"] (BUG-002: no more seed user).
  const { data: me } = useQuery({ queryKey: ["me"], queryFn: api.user.me });

  async function handleLogout() {
    try {
      await fetch(`${API_URL}/auth/logout`, { method: "POST", credentials: "include" });
    } catch {
      // Network hiccup — clear locally anyway; the next protected call will 401.
    }
    qc.clear();
    navigate("/login", { replace: true });
  }

  return (
    <header className="flex h-header shrink-0 items-center justify-between gap-4 border-b border-border bg-bg px-4">
      <h1 className="truncate text-base font-semibold text-text">{title ?? "Fluxos"}</h1>
      <div className="flex items-center gap-3">
        <label className="relative hidden sm:block">
          <span className="sr-only">Buscar</span>
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden="true" />
          <input
            type="search"
            placeholder="Buscar…"
            className="h-9 w-56 rounded-md border border-border-input bg-bg pl-8 pr-3 text-sm text-text placeholder:text-muted focus:border-accent"
          />
        </label>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            aria-label="Menu do usuário"
            className="flex items-center gap-1 rounded-pill focus:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          >
            <Avatar name={me?.name ?? "?"} color={me?.avatarColor} />
            <ChevronDown className="h-4 w-4 text-muted" aria-hidden="true" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={6}
              className="z-50 min-w-48 rounded-md border border-border bg-bg p-1 shadow-card"
            >
              {me && (
                <div className="px-2 py-1.5">
                  <p className="truncate text-sm font-medium text-text">{me.name}</p>
                  <p className="truncate text-xs text-muted">{me.email}</p>
                </div>
              )}
              <DropdownMenu.Separator className="my-1 h-px bg-border" />
              <DropdownMenu.Item
                onSelect={handleLogout}
                className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm text-text outline-none data-[highlighted]:bg-surface"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" /> Sair
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      </div>
    </header>
  );
}
