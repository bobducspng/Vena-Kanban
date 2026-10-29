import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { api } from "../../data/store";

const size = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

/** Configurações > Backup: when the last nightly copy ran and whether it worked. */
export function BackupStatus() {
  const { data: b } = useQuery({ queryKey: ["backupStatus"], queryFn: api.org.backupStatus });
  if (!b) return null;
  // More than ~26 h without a run means the schedule stopped.
  const stale = b.installed && Date.now() - new Date(b.at).getTime() > 26 * 3600_000;
  const ok = b.installed && b.status === "ok" && !stale;
  return (
    <section aria-label="Backup" className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <h3 className="text-sm font-semibold text-text">Backup</h3>
      {!b.installed ? (
        <p className="inline-flex items-center gap-2 text-sm text-warning"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> O backup ainda não foi instalado na VM (deploy/setup-backup.sh).</p>
      ) : (
        <>
          <p className={`inline-flex items-center gap-2 text-sm ${ok ? "text-success" : "text-danger"}`}>
            {ok ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
            {b.status !== "ok" ? b.message : stale ? `Nenhum backup desde ${new Date(b.at).toLocaleString("pt-BR")}: o agendamento parou?` : `Último backup em ${new Date(b.at).toLocaleString("pt-BR")}`}
          </p>
          {b.status === "ok" && (
            <p className="text-xs text-muted">Banco {size(b.dbBytes)} · {b.filesCount} arquivo(s), {size(b.filesBytes)} · espaço livre no disco: {b.diskFree} · guarda as últimas 14 noites, na própria VM.</p>
          )}
        </>
      )}
    </section>
  );
}
