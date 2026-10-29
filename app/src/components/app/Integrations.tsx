import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Copy, KeyRound, Plus, Trash2, Webhook, XCircle } from "lucide-react";
import { api } from "../../data/store";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { useToast } from "../ui/Toast";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : String(e));
const when = (d: string | Date | null | undefined) => (d ? new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "nunca");

function useCopy() {
  const toast = useToast();
  return (text: string, what = "Copiado") => { void navigator.clipboard.writeText(text); toast(what, "success"); };
}

/** Configurações > Integrações: API keys and how to call the API. */
export function ApiSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const copy = useCopy();
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const { data: info } = useQuery({ queryKey: ["apiBase"], queryFn: api.integration.apiBase });
  const { data: tokens } = useQuery({ queryKey: ["apiTokens"], queryFn: api.integration.tokens });
  const create = useMutation({
    mutationFn: () => api.integration.createToken(name.trim()),
    onSuccess: (r) => { setFresh(r.token); setName(""); qc.invalidateQueries({ queryKey: ["apiTokens"] }); },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const revoke = useMutation({ mutationFn: api.integration.revokeToken, onSuccess: () => qc.invalidateQueries({ queryKey: ["apiTokens"] }) });
  const base = info?.base ?? "";

  return (
    <section aria-label="Integrações" className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div>
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-text"><KeyRound className="h-4 w-4" aria-hidden="true" /> Integrações · API</h3>
        <p className="text-xs text-muted">Outros sistemas leem, criam, alteram e movem cards com uma chave. A chave vale para a organização inteira (como um administrador): guarde como uma senha.
          Para avisar outros sistemas quando algo acontece, use os <strong>Webhooks</strong> em Configurar pipe.</p>
      </div>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) create.mutate(); }}>
        <div className="min-w-56 flex-1"><Input aria-label="Nome da chave" placeholder="Para que é a chave (ex.: ERP, Site, Zapier)" value={name} onChange={(e) => setName(e.target.value)} /></div>
        <Button type="submit" loading={create.isPending} disabled={!name.trim()}><Plus className="h-4 w-4" aria-hidden="true" /> Criar chave</Button>
      </form>
      {fresh && (
        <div className="flex flex-col gap-2 rounded-md border border-warning p-3">
          <p className="text-sm text-text"><strong>Copie a chave agora:</strong> ela não aparece de novo.</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-1 text-xs text-text">{fresh}</code>
            <Button size="sm" onClick={() => copy(fresh, "Chave copiada")}><Copy className="h-4 w-4" aria-hidden="true" /> Copiar</Button>
          </div>
          <button className="self-start text-xs text-muted" onClick={() => setFresh(null)}>Já copiei</button>
        </div>
      )}
      {!!tokens?.length && (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {tokens.map((t) => (
            <li key={t.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <span className="font-medium text-text">{t.name}</span>
              <code className="text-xs text-muted">{t.prefix}…</code>
              <span className="text-xs text-muted">criada {when(t.createdAt)} · último uso {when(t.lastUsedAt)}</span>
              <span className="flex-1" />
              {t.revokedAt ? <span className="text-xs text-muted">revogada</span> : (
                <button className="text-xs text-danger" onClick={() => { if (confirm(`Revogar a chave "${t.name}"? Os sistemas que a usam param de funcionar.`)) revoke.mutate(t.id); }}>Revogar</button>
              )}
            </li>
          ))}
        </ul>
      )}
      <details className="text-xs text-muted">
        <summary className="cursor-pointer text-accent">Como usar a API</summary>
        <div className="mt-2 flex flex-col gap-2">
          <p>Endereço: <code className="text-text">{base}</code> · cabeçalho <code className="text-text">Authorization: Bearer SUA_CHAVE</code> · até 120 chamadas por minuto.
            Campos pelo nome, com os formatos da importação de planilha (29/10/2026, 1.234,56, Sim/Não, opções pelo nome, pessoas pelo e-mail).</p>
          <pre className="overflow-auto rounded bg-surface p-2 text-[11px] text-text">{`# Pipes, fases e campos
curl -H "Authorization: Bearer SUA_CHAVE" ${base}/pipes

# Cards de um pipe (filtros opcionais: phase, status=open|done, updated_since, limit, offset)
curl -H "Authorization: Bearer SUA_CHAVE" "${base}/pipes/ID_DO_PIPE/cards?status=open"

# Criar card
curl -X POST -H "Authorization: Bearer SUA_CHAVE" -H "Content-Type: application/json" \\
  -d '{"title":"Pedido 123","fields":{"Cliente":"ACME","Valor":"1.500,00","Entrega":"30/11/2026"}}' \\
  ${base}/pipes/ID_DO_PIPE/cards

# Alterar campos / mover de fase
curl -X PATCH -H "Authorization: Bearer SUA_CHAVE" -H "Content-Type: application/json" \\
  -d '{"fields":{"Status do pagamento":"Pago"}}' ${base}/cards/ID_DO_CARD
curl -X POST -H "Authorization: Bearer SUA_CHAVE" -H "Content-Type: application/json" \\
  -d '{"phase":"Concluído"}' ${base}/cards/ID_DO_CARD/move`}</pre>
          <p>O card também pode ser indicado pelo número: <code className="text-text">/cards/123?pipe=ID_DO_PIPE</code>. As respostas trazem o card com fase, responsáveis e cada campo (valor e texto).</p>
        </div>
      </details>
    </section>
  );
}

/** Configurar pipe > Webhooks: notify other systems when something happens here. */
export function WebhooksSection({ pipeId }: { pipeId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const copy = useCopy();
  const [url, setUrl] = useState("");
  const [events, setEvents] = useState<string[]>(["card.created", "card.moved"]);
  const [openLog, setOpenLog] = useState<string | null>(null);
  const { data: info } = useQuery({ queryKey: ["apiBase"], queryFn: api.integration.apiBase });
  const { data: hooks } = useQuery({ queryKey: ["webhooks", pipeId], queryFn: () => api.integration.webhooks(pipeId) });
  const { data: log } = useQuery({ queryKey: ["webhookLog", openLog], queryFn: () => api.integration.deliveries(openLog!), enabled: !!openLog });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["webhooks", pipeId] }); qc.invalidateQueries({ queryKey: ["webhookLog"] }); };
  const create = useMutation({
    mutationFn: () => api.integration.createWebhook({ pipeId, url: url.trim(), events }),
    onSuccess: (r) => { setUrl(""); refresh(); copy(r.secret, "Webhook criado. Segredo de assinatura copiado."); },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const update = useMutation({ mutationFn: api.integration.updateWebhook, onSuccess: refresh, onError: (e) => toast(errMsg(e), "error") });
  const remove = useMutation({ mutationFn: api.integration.removeWebhook, onSuccess: refresh });
  const test = useMutation({
    mutationFn: api.integration.testWebhook,
    onSuccess: (d) => { refresh(); toast(d?.status === "ok" ? `Funcionou (${d.httpStatus})` : `Falhou: ${d?.error ?? "sem resposta"}`, d?.status === "ok" ? "success" : "error"); },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const secret = useMutation({ mutationFn: api.integration.webhookSecret, onSuccess: (r) => copy(r.secret, "Segredo copiado") });
  const evs = Object.entries(info?.events ?? {}) as [string, string][];
  const toggle = (list: string[], e: string) => (list.includes(e) ? list.filter((x) => x !== e) : [...list, e]);

  return (
    <section aria-label="Webhooks" className="flex flex-col gap-3 rounded-lg border border-border bg-bg p-4">
      <div>
        <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-text"><Webhook className="h-4 w-4" aria-hidden="true" /> Webhooks</h3>
        <p className="text-xs text-muted">Avisa outro sistema (ERP, Zapier, Make, n8n…) quando algo acontece neste pipe: o Venaflow envia um POST com o card em JSON,
          assinado no cabeçalho <code>X-Venaflow-Signature</code> (HMAC-SHA256 com o segredo). Se falhar, tenta de novo em 30 s e em 5 min.</p>
      </div>
      {(hooks ?? []).map((w) => (
        <div key={w.id} className="flex flex-col gap-2 rounded-md border border-border p-3 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate text-xs text-text">{w.url}</code>
            <label className="inline-flex items-center gap-1 text-xs text-text">
              <input type="checkbox" className="h-4 w-4 accent-accent" checked={w.active} onChange={(e) => update.mutate({ id: w.id, active: e.target.checked })} /> ativo
            </label>
            <Button size="sm" variant="secondary" loading={test.isPending && test.variables === w.id} onClick={() => test.mutate(w.id)}>Testar</Button>
            <button className="text-xs text-accent" onClick={() => secret.mutate(w.id)}>copiar segredo</button>
            <button aria-label="Excluir webhook" className="rounded p-1 text-muted hover:text-danger" onClick={() => { if (confirm("Excluir este webhook?")) remove.mutate(w.id); }}><Trash2 className="h-4 w-4" /></button>
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            {evs.map(([e, label]) => (
              <label key={e} className="inline-flex items-center gap-1.5 text-xs text-text">
                <input type="checkbox" className="h-3.5 w-3.5 accent-accent" checked={w.events.includes(e)}
                  onChange={() => { const next = toggle(w.events, e); if (next.length) update.mutate({ id: w.id, events: next }); }} />{label}
              </label>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
            {w.last ? (
              <span className={`inline-flex items-center gap-1 ${w.last.status === "ok" ? "text-success" : "text-danger"}`}>
                {w.last.status === "ok" ? <CheckCircle2 className="h-3.5 w-3.5" aria-hidden="true" /> : <XCircle className="h-3.5 w-3.5" aria-hidden="true" />}
                último envio {when(w.last.createdAt)} ({w.last.event}{w.last.httpStatus ? ` · ${w.last.httpStatus}` : ""}{w.last.error ? ` · ${w.last.error}` : ""})
              </span>
            ) : <span>nenhum envio ainda</span>}
            <button className="text-accent" onClick={() => setOpenLog(openLog === w.id ? null : w.id)}>{openLog === w.id ? "fechar histórico" : "histórico"}</button>
          </div>
          {openLog === w.id && (
            <ul className="max-h-48 overflow-auto rounded bg-surface p-2 text-xs">
              {(log ?? []).map((d) => (
                <li key={d.id} className={d.status === "ok" ? "text-muted" : "text-danger"}>
                  {when(d.createdAt)} · {d.event} · {d.status === "ok" ? `ok ${d.httpStatus}` : `falhou${d.httpStatus ? ` ${d.httpStatus}` : ""}: ${d.error}`} · {d.attempts} tentativa(s) · {d.durationMs} ms
                </li>
              ))}
              {!log?.length && <li className="text-muted">Nada ainda.</li>}
            </ul>
          )}
        </div>
      ))}
      <form className="flex flex-col gap-2 rounded-md border border-dashed border-border-input p-3" onSubmit={(e) => { e.preventDefault(); if (url.trim() && events.length) create.mutate(); }}>
        <Input aria-label="Endereço do webhook" placeholder="https://seu-sistema.com/webhooks/venaflow" value={url} onChange={(e) => setUrl(e.target.value)} />
        <div className="flex flex-wrap gap-x-4 gap-y-1">
          {evs.map(([e, label]) => (
            <label key={e} className="inline-flex items-center gap-1.5 text-xs text-text">
              <input type="checkbox" className="h-3.5 w-3.5 accent-accent" checked={events.includes(e)} onChange={() => setEvents((l) => toggle(l, e))} />{label}
            </label>
          ))}
        </div>
        <Button size="sm" type="submit" className="self-start" loading={create.isPending} disabled={!url.trim() || !events.length}><Plus className="h-4 w-4" aria-hidden="true" /> Adicionar webhook</Button>
      </form>
    </section>
  );
}
