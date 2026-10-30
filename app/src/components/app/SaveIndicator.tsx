import { useEffect, useState } from "react";
import { useIsMutating, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

const hhmm = (d: Date) => d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

/**
 * "Salvando… / ✓ Salvo às 14:32 / ⚠ Não foi salvo" in the header of every screen. It
 * watches every change the app sends to the server (all mutations), so no screen is
 * left out. While something is still being saved, closing the tab asks first.
 */
export function SaveIndicator() {
  const qc = useQueryClient();
  const pending = useIsMutating();
  const [last, setLast] = useState<{ ok: boolean; at: Date; error?: string } | null>(null);

  useEffect(() => qc.getMutationCache().subscribe((e) => {
    if (e.type !== "updated" || e.mutation?.options.meta?.silent) return;
    if (e.action.type === "success") setLast({ ok: true, at: new Date() });
    if (e.action.type === "error") {
      const err = e.action.error;
      setLast({ ok: false, at: new Date(), error: err instanceof Error ? err.message : String(err) });
    }
  }), [qc]);

  useEffect(() => {
    if (!pending) return;
    const warn = (ev: BeforeUnloadEvent) => { ev.preventDefault(); ev.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);

  if (pending) {
    return <span role="status" className="inline-flex items-center gap-1.5 text-xs text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Salvando…</span>;
  }
  if (!last) return null;
  return last.ok ? (
    <span role="status" className="inline-flex items-center gap-1.5 text-xs text-success" title="Todas as alterações foram gravadas">
      <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> Salvo às {hhmm(last.at)}
    </span>
  ) : (
    <span role="alert" className="inline-flex items-center gap-1.5 text-xs font-medium text-danger" title={last.error}>
      <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Não foi salvo ({hhmm(last.at)}) — tente de novo
    </span>
  );
}
