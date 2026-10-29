import { useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Cloud } from "lucide-react";
import { api } from "../../data/store";
import { API_URL } from "../../lib/trpc";
import { Button } from "../ui/Button";
import { useToast } from "../ui/Toast";

const size = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const when = (d: string | Date) => new Date(d).toLocaleString("pt-BR");
const DRIVE_API = "https://console.cloud.google.com/apis/library/drive.googleapis.com";

/** Configurações > Backup: the nightly copy on the VM and the copy in the Google Drive. */
export function BackupStatus() {
  const qc = useQueryClient();
  const toast = useToast();
  const [params, setParams] = useSearchParams();
  const { data: b } = useQuery({ queryKey: ["backupStatus"], queryFn: api.org.backupStatus });
  const { data: d } = useQuery({ queryKey: ["driveStatus"], queryFn: api.org.driveStatus });
  const disconnect = useMutation({ mutationFn: api.org.driveDisconnect, onSuccess: () => qc.invalidateQueries({ queryKey: ["driveStatus"] }) });

  // Back from Google: ?drive=ok or ?drive=erro&motivo=…
  const driveResult = params.get("drive");
  const motivo = params.get("motivo") ?? "";
  useEffect(() => {
    if (!driveResult) return;
    if (driveResult === "ok") toast("Google Drive conectado. A cópia vai junto com o backup da noite.", "success");
    else toast(`Não foi possível conectar o Drive: ${motivo}`, "error");
    qc.invalidateQueries({ queryKey: ["driveStatus"] });
    if (driveResult === "ok") setParams({}, { replace: true });
  }, [driveResult]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!b) return null;
  // More than ~26 h without a run means the schedule stopped.
  const stale = b.installed && Date.now() - new Date(b.at).getTime() > 26 * 3600_000;
  const ok = b.installed && b.status === "ok" && !stale;
  const apiOff = driveResult === "erro" && /API do Google Drive/i.test(motivo);

  return (
    <section aria-label="Backup" className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <h3 className="text-sm font-semibold text-text">Backup</h3>
      {!b.installed ? (
        <p className="inline-flex items-center gap-2 text-sm text-warning"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> O backup ainda não foi instalado na VM (deploy/setup-backup.sh).</p>
      ) : (
        <div>
          <p className={`inline-flex items-center gap-2 text-sm ${ok ? "text-success" : "text-danger"}`}>
            {ok ? <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> : <AlertTriangle className="h-4 w-4" aria-hidden="true" />}
            {b.status !== "ok" ? b.message : stale ? `Nenhum backup desde ${when(b.at)}: o agendamento parou?` : `Último backup na VM em ${when(b.at)}`}
          </p>
          {b.status === "ok" && (
            <p className="text-xs text-muted">Banco {size(b.dbBytes)} · {b.filesCount} arquivo(s), {size(b.filesBytes)} · espaço livre no disco: {b.diskFree} · últimas 14 noites, na própria VM.</p>
          )}
        </div>
      )}

      <div className="flex flex-col gap-2 border-t border-border pt-3">
        <h4 className="inline-flex items-center gap-2 text-sm font-medium text-text"><Cloud className="h-4 w-4" aria-hidden="true" /> Cópia no Google Drive</h4>
        {!d?.connected ? (
          <>
            <p className="text-xs text-muted">
              Guarda uma cópia fora da VM: toda noite o banco e os arquivos novos vão para a pasta "Venaflow - backup" no Drive da conta escolhida
              (últimas 30 noites do banco; arquivos ficam). O Venaflow só enxerga os arquivos que ele mesmo cria.
            </p>
            {apiOff && (
              <p className="rounded-md bg-surface p-2 text-xs text-text">
                Falta ativar a API do Drive no projeto do Google Cloud (o mesmo do login): abra{" "}
                <a href={DRIVE_API} target="_blank" rel="noreferrer" className="text-accent underline">este link</a>, confira se o projeto selecionado é o do Venaflow,
                clique em <strong>Ativar</strong>, espere 1 minuto e conecte de novo.
              </p>
            )}
            <Button size="sm" className="self-start" onClick={() => { window.location.href = `${API_URL}/auth/google/drive`; }}>Conectar Google Drive</Button>
          </>
        ) : (
          <>
            <p className="text-sm text-text">
              Conectado a <strong>{d.email}</strong>
              {d.folderUrl && <> · <a href={d.folderUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">abrir a pasta</a></>}
            </p>
            {d.last ? (
              <p className={`text-xs ${d.last.status === "ok" ? "text-muted" : "text-danger"}`}>{when(d.last.at)}: {d.last.message}</p>
            ) : <p className="text-xs text-muted">A primeira cópia vai junto com o próximo backup (03:30).</p>}
            <button className="self-start text-xs text-danger" onClick={() => { if (confirm("Parar de copiar para o Drive? O que já está lá continua lá.")) disconnect.mutate(); }}>Desconectar</button>
          </>
        )}
      </div>
    </section>
  );
}
