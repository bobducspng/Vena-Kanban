import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import * as Popover from "@radix-ui/react-popover";
import { AlarmClock, AtSign, Bell, Clock, Globe, UserPlus, Zap } from "lucide-react";
import { api } from "../../data/store";
import type { Notification } from "../../data/types";
import { useMe } from "../../lib/useMe";
import { cn } from "../../lib/cn";

const ICON: Record<Notification["type"], typeof Bell> = {
  mention: AtSign, assigned: UserPlus, late: Clock, expired: AlarmClock, overdue: AlarmClock, automation_failed: Zap, outside: Globe,
};
const ago = (iso: string) => {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  return m < 1 ? "agora" : m < 60 ? `há ${m} min` : m < 1440 ? `há ${Math.round(m / 60)} h` : `há ${Math.round(m / 1440)} d`;
};

/** Sino: unread count (polled every minute) and the latest 50, with "marcar todas como lidas". */
export function NotificationBell() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const { data: unread } = useQuery({ queryKey: ["notifications", "unread"], queryFn: api.notification.unread, refetchInterval: 60_000 });
  const { data: list, refetch } = useQuery({ queryKey: ["notifications", "list"], queryFn: api.notification.list, enabled: false });
  const { me } = useMe();
  const emailPref = useMutation({ mutationFn: api.notification.setEmail, onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }) });
  const read = useMutation({
    mutationFn: (ids?: string[]) => api.notification.markRead(ids),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const open = (n: Notification) => {
    if (!n.readAt) read.mutate([n.id]);
    if (n.link) navigate(n.link);
    else if (n.pipeId && n.cardId) navigate(`/pipes/${n.pipeId}?card=${n.cardId}`);
  };

  return (
    <Popover.Root onOpenChange={(o) => { if (o) void refetch(); }}>
      <Popover.Trigger aria-label={unread ? `Notificações (${unread} não lidas)` : "Notificações"}
        className="relative rounded-md p-2 text-muted hover:bg-surface hover:text-text focus:outline-none focus-visible:ring-2 focus-visible:ring-accent">
        <Bell className="h-5 w-5" aria-hidden="true" />
        {!!unread && (
          <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-pill bg-danger px-1 text-center text-[10px] font-semibold leading-4 text-on-accent">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content align="end" sideOffset={6} className="z-50 w-96 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-bg shadow-pop">
          <div className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-sm font-semibold text-text">Notificações</span>
            {!!unread && <button className="text-xs text-accent" onClick={() => read.mutate(undefined)}>Marcar todas como lidas</button>}
          </div>
          <ul className="max-h-96 overflow-y-auto">
            {!list?.length && <li className="px-3 py-6 text-center text-sm text-muted">Nada por aqui.</li>}
            {list?.map((n) => {
              const Icon = ICON[n.type] ?? Bell;
              return (
                <li key={n.id}>
                  <Popover.Close asChild>
                    <button onClick={() => open(n)} className={cn("flex w-full gap-3 px-3 py-2.5 text-left hover:bg-surface", !n.readAt && "bg-surface/60")}>
                      <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", n.type === "automation_failed" || n.type === "expired" ? "text-danger" : n.type === "late" ? "text-warning" : "text-muted")} aria-hidden="true" />
                      <span className="min-w-0 flex-1">
                        <span className={cn("block text-sm", n.readAt ? "text-muted" : "font-medium text-text")}>{n.title}</span>
                        {n.body && <span className="block truncate text-xs text-muted">{n.body}</span>}
                        <span className="block text-xs text-muted">{ago(n.createdAt)}</span>
                      </span>
                      {!n.readAt && <span className="mt-1.5 h-2 w-2 shrink-0 rounded-pill bg-accent" aria-label="não lida" />}
                    </button>
                  </Popover.Close>
                </li>
              );
            })}
          </ul>
          <label className="flex items-center gap-2 border-t border-border px-3 py-2 text-xs text-text">
            <input type="checkbox" className="h-4 w-4 accent-accent" checked={!!me?.emailNotifications} onChange={(e) => emailPref.mutate(e.target.checked)} />
            Receber também por e-mail
          </label>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
