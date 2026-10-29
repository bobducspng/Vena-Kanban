import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CheckCircle2, Cloud, Copy } from "lucide-react";
import { api } from "../../data/store";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { useToast } from "../ui/Toast";

const size = (b: number) => (b >= 1024 ** 3 ? `${(b / 1024 ** 3).toFixed(1)} GB` : b >= 1024 ** 2 ? `${(b / 1024 ** 2).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);
const when = (d: string | Date) => new Date(d).toLocaleString("pt-BR");
const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Configurações > Backup: the nightly copy on the VM and the copy in the Google Drive. */
export function BackupStatus() {
  const { data: b } = useQuery({ queryKey: ["backupStatus"], queryFn: api.org.backupStatus });
  if (!b) return null;
  // More than ~26 h without a run means the schedule stopped.
  const stale = b.installed && Date.now() - new Date(b.at).getTime() > 26 * 3600_000;
  const ok = b.installed && b.status === "ok" && !stale;

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
      <DriveCopy />
    </section>
  );
}

/** Cópia no Google Drive through an Apps Script published in the admin's own account. */
function DriveCopy() {
  const qc = useQueryClient();
  const toast = useToast();
  const [code, setCode] = useState("");
  const [url, setUrl] = useState("");
  const { data: d } = useQuery({ queryKey: ["driveStatus"], queryFn: api.org.driveStatus });
  const refresh = () => qc.invalidateQueries({ queryKey: ["driveStatus"] });
  const getCode = useMutation({ mutationFn: api.org.driveScript, onSuccess: (r) => setCode(r.code), onError: (e) => toast(errMsg(e), "error") });
  const connect = useMutation({
    mutationFn: () => api.org.driveConnect(url),
    onSuccess: (r) => { refresh(); setCode(""); setUrl(""); toast(`Funcionou: pasta criada no Drive de ${r.email}`, "success"); },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const test = useMutation({ mutationFn: api.org.driveTest, onSuccess: () => toast("O Drive respondeu: tudo certo", "success"), onError: (e) => toast(errMsg(e), "error") });
  const disconnect = useMutation({ mutationFn: api.org.driveDisconnect, onSuccess: refresh });
  const copy = () => { void navigator.clipboard.writeText(code); toast("Código copiado", "success"); };

  return (
    <div className="flex flex-col gap-2 border-t border-border pt-3">
      <h4 className="inline-flex items-center gap-2 text-sm font-medium text-text"><Cloud className="h-4 w-4" aria-hidden="true" /> Cópia no Google Drive</h4>
      {d?.connected ? (
        <>
          <p className="text-sm text-text">
            Copiando para o Drive de <strong>{d.email}</strong>
            {d.folderUrl && <> · <a href={d.folderUrl} target="_blank" rel="noreferrer" className="text-accent hover:underline">abrir a pasta</a></>}
          </p>
          {d.last ? (
            <p className={`text-xs ${d.last.status === "ok" ? "text-muted" : "text-danger"}`}>{when(d.last.at)}: {d.last.message}</p>
          ) : <p className="text-xs text-muted">A primeira cópia vai junto com o próximo backup (03:30).</p>}
          <div className="flex gap-3">
            <button className="text-xs text-accent" onClick={() => test.mutate()}>Testar agora</button>
            <button className="text-xs text-danger" onClick={() => { if (confirm("Parar de copiar para o Drive? O que já está lá continua lá.")) disconnect.mutate(); }}>Desconectar</button>
          </div>
        </>
      ) : (
        <>
          <p className="text-xs text-muted">
            Guarda uma cópia fora da VM, no seu Google Drive: toda noite o banco e os arquivos novos vão para a pasta "Venaflow - backup"
            (últimas 30 noites do banco; os arquivos ficam). Não precisa do Google Cloud: é um pequeno programa (Apps Script) na sua própria conta.
          </p>
          <ol className="flex list-decimal flex-col gap-2 pl-5 text-sm text-text">
            <li>
              <Button size="sm" variant="secondary" loading={getCode.isPending} onClick={() => getCode.mutate()}>Mostrar o código</Button>
              {code && (
                <div className="mt-2 flex flex-col gap-1">
                  <Button size="sm" className="self-start" onClick={copy}><Copy className="h-4 w-4" aria-hidden="true" /> Copiar código</Button>
                  <pre className="max-h-40 overflow-auto rounded bg-surface p-2 text-[11px] text-muted">{code}</pre>
                </div>
              )}
            </li>
            <li>
              Abra <a href="https://script.google.com/home/projects/create" target="_blank" rel="noreferrer" className="text-accent underline">script.google.com (novo projeto)</a> com a conta que vai guardar as cópias.
              Apague o que estiver escrito, cole o código (Ctrl+V) e clique no disquete para <strong>Salvar</strong>.
            </li>
            <li>
              Clique em <strong>Implantar → Nova implantação</strong>. Na engrenagem ao lado de "Selecione o tipo", escolha <strong>App da Web</strong>.
              Deixe <strong>Executar como: Eu</strong> e <strong>Quem pode acessar: Qualquer pessoa</strong>. Clique em <strong>Implantar</strong>.
            </li>
            <li>
              O Google pede autorização: <strong>Autorizar acesso</strong> → escolha sua conta. Se aparecer "o Google não verificou este app",
              clique em <strong>Avançado → Acessar (não seguro)</strong>: o app é o seu próprio código → <strong>Permitir</strong>.
            </li>
            <li>
              Copie o <strong>URL do app da Web</strong> (termina em /exec), cole aqui e clique em Conectar:
              <div className="mt-1 flex flex-wrap gap-2">
                <div className="min-w-64 flex-1"><Input aria-label="URL do app da Web" placeholder="https://script.google.com/macros/s/.../exec" value={url} onChange={(e) => setUrl(e.target.value)} /></div>
                <Button size="sm" loading={connect.isPending} disabled={!url.trim()} onClick={() => connect.mutate()}>Conectar</Button>
              </div>
            </li>
          </ol>
        </>
      )}
    </div>
  );
}
