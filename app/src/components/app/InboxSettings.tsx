import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Inbox } from "lucide-react";
import { api } from "../../data/store";
import type { FieldDef, Pipe } from "../../data/types";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { useToast } from "../ui/Toast";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const when = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—");

/** Configurações > Caixa de entrada: read the sending account once a minute. */
export function InboxSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: st } = useQuery({ queryKey: ["inboxStatus"], queryFn: api.org.inboxStatus, refetchInterval: 60_000 });
  const toggle = useMutation({
    mutationFn: api.org.inboxSetEnabled,
    onSuccess: (_r, on) => { qc.invalidateQueries({ queryKey: ["inboxStatus"] }); qc.invalidateQueries({ queryKey: ["cardAddress"] }); toast(on ? "Caixa de entrada ligada" : "Caixa de entrada desligada", "success"); },
    onError: (e) => toast(errMsg(e), "error"),
  });
  if (!st) return null;
  return (
    <section aria-label="Caixa de entrada" className="flex flex-col gap-2 rounded-lg border border-border p-4">
      <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-text"><Inbox className="h-4 w-4" aria-hidden="true" /> Caixa de entrada de e-mail</h3>
      {!st.configured ? (
        <p className="text-xs text-muted">Precisa do envio de e-mail configurado com uma conta Google.</p>
      ) : (
        <>
          <p className="text-xs text-muted">
            O Venaflow lê a caixa de <strong>{st.account}</strong> a cada minuto. E-mails para o endereço de um pipe criam cards (ligue em Configurar pipe);
            respostas aos e-mails enviados pelos cards voltam para o card certo. Os outros e-mails da caixa são ignorados. Só lê o que chegar depois de ligar.
          </p>
          <label className="inline-flex items-center gap-2 text-sm text-text">
            <input type="checkbox" className="h-4 w-4 accent-accent" checked={st.enabled} disabled={toggle.isPending} onChange={(e) => toggle.mutate(e.target.checked)} />
            Ler a caixa de entrada
          </label>
          {st.enabled && (
            <p className={`text-xs ${st.lastError ? "text-danger" : "text-muted"}`}>
              Última leitura: {when(st.lastCheckAt)} · {st.processed} e-mail(s) lidos{st.lastError ? ` · erro: ${st.lastError}` : ""}
            </p>
          )}
        </>
      )}
    </section>
  );
}

/** Configurar pipe > Receber e-mails: the pipe's address and what goes where. */
export function PipeInboxSection({ pipe, fields }: { pipe: Pipe; fields: FieldDef[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [address, setAddress] = useState<string | null>(null);
  const [domains, setDomains] = useState(pipe.inboxAllowedDomains ?? "");
  useEffect(() => setDomains(pipe.inboxAllowedDomains ?? ""), [pipe.inboxAllowedDomains]);
  const { data: st } = useQuery({ queryKey: ["inboxStatus"], queryFn: api.org.inboxStatus });
  const getAddress = useMutation({ mutationFn: () => api.pipe.inboxAddress(pipe.id), onSuccess: (r) => setAddress(r.address) });
  useEffect(() => { if (pipe.inboxEnabled && st?.enabled && !address && !getAddress.isPending) getAddress.mutate(); }, [pipe.inboxEnabled, st?.enabled]); // eslint-disable-line react-hooks/exhaustive-deps
  const update = useMutation({
    mutationFn: (patch: Parameters<typeof api.pipe.update>[0]) => api.pipe.update(patch),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pipe", pipe.id] }); },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const emailFields = fields.filter((f) => f.type === "email" && !f.archivedAt);
  const textFields = fields.filter((f) => ["long_text", "short_text"].includes(f.type) && !f.archivedAt);

  return (
    <section aria-label="Receber e-mails" className="flex flex-col gap-3 rounded-lg border border-border bg-bg p-4">
      <div>
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-text"><Inbox className="h-4 w-4" aria-hidden="true" /> Receber e-mails</h3>
        <p className="text-xs text-muted">Cada e-mail enviado para o endereço deste pipe vira um card: o assunto é o título, os anexos vão para o card e as respostas continuam no mesmo card.</p>
      </div>
      {!st?.enabled ? (
        <p className="text-xs text-muted">Ligue antes a caixa de entrada em Configurações → Caixa de entrada de e-mail.</p>
      ) : (
        <>
          <label className="inline-flex items-center gap-2 text-sm text-text">
            <input type="checkbox" className="h-4 w-4 accent-accent" checked={!!pipe.inboxEnabled} onChange={(e) => update.mutate({ pipeId: pipe.id, inboxEnabled: e.target.checked })} />
            Criar cards a partir de e-mails
          </label>
          {pipe.inboxEnabled && (
            <>
              {address && (
                <div className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="text-muted">Endereço do pipe:</span>
                  <code className="rounded bg-surface px-2 py-1 text-xs text-text">{address}</code>
                  <Button size="sm" variant="secondary" onClick={() => { void navigator.clipboard.writeText(address); toast("Endereço copiado", "success"); }}><Copy className="h-4 w-4" aria-hidden="true" /> Copiar</Button>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-text">E-mail de quem enviou vai para</span>
                  <Select aria-label="Campo do remetente" value={pipe.inboxFromFieldId ?? "__none"} onValueChange={(v) => update.mutate({ pipeId: pipe.id, inboxFromFieldId: v === "__none" ? null : v })}
                    options={[{ value: "__none", label: "Não guardar" }, ...emailFields.map((f) => ({ value: f.id, label: f.label }))]} />
                </div>
                <div className="flex flex-col gap-1">
                  <span className="text-xs font-medium text-text">Texto do e-mail vai para</span>
                  <Select aria-label="Campo do texto" value={pipe.inboxBodyFieldId ?? "__none"} onValueChange={(v) => update.mutate({ pipeId: pipe.id, inboxBodyFieldId: v === "__none" ? null : v })}
                    options={[{ value: "__none", label: "Só no histórico de e-mails do card" }, ...textFields.map((f) => ({ value: f.id, label: f.label }))]} />
                </div>
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium text-text">Aceitar só e-mails destes domínios <span className="font-normal text-muted">(vazio = de qualquer um)</span></span>
                <Input aria-label="Domínios aceitos" placeholder="vena.app.br, cliente.com.br" value={domains} onChange={(e) => setDomains(e.target.value)}
                  onBlur={() => { if (domains !== (pipe.inboxAllowedDomains ?? "")) update.mutate({ pipeId: pipe.id, inboxAllowedDomains: domains.trim() || null }); }} />
              </div>
              <p className="text-xs text-muted">Campos obrigatórios não impedem a criação: a equipe completa depois. As automações de "card criado" rodam normalmente.</p>
            </>
          )}
        </>
      )}
    </section>
  );
}
