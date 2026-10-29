import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, Link2, Send } from "lucide-react";
import { api } from "../../data/store";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Textarea } from "../ui/Textarea";
import { useToast } from "../ui/Toast";

const date = (iso: string | Date) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado");

/** "Pessoas de fora" on a card: phase-form links (fill one phase) and the requester's messages. */
export function OutsideSection({ cardId, phaseName }: { cardId: string; phaseName: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [sendTo, setSendTo] = useState("");
  const [note, setNote] = useState("");
  const [reply, setReply] = useState("");
  const { data: links } = useQuery({ queryKey: ["phaseLinks", cardId], queryFn: () => api.outside.phaseLinks(cardId) });
  const { data: request } = useQuery({ queryKey: ["request", cardId], queryFn: () => api.outside.request(cardId), refetchInterval: 60_000 });
  const done = () => { qc.invalidateQueries({ queryKey: ["phaseLinks", cardId] }); qc.invalidateQueries({ queryKey: ["request", cardId] }); qc.invalidateQueries({ queryKey: ["events", cardId] }); };

  const create = useMutation({
    mutationFn: () => api.outside.createPhaseLink({ cardId, sendTo: sendTo.trim() || undefined, note: note.trim() || undefined }),
    onSuccess: (r) => {
      done(); setSendTo(""); setNote(""); setOpen(false);
      void navigator.clipboard.writeText(r.url);
      toast(r.mailed ? "Link criado e enviado por e-mail (copiado também)" : "Link criado e copiado", "success");
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const revoke = useMutation({ mutationFn: api.outside.revokePhaseLink, onSuccess: done, onError: (e) => toast(errMsg(e), "error") });
  const send = useMutation({
    mutationFn: () => api.outside.reply(request!.id, reply.trim()),
    onSuccess: (r) => { setReply(""); done(); toast(r.mailed ? "Resposta enviada por e-mail" : "Resposta registrada (e-mail não configurado)", "success"); },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const active = (links ?? []).filter((l) => !l.revokedAt);

  return (
    <section aria-label="Pessoas de fora" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Pessoas de fora</h3>
        <button className="text-xs text-accent" onClick={() => setOpen((o) => !o)}>{open ? "Fechar" : "Pedir para preencher"}</button>
      </div>
      {open && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <p className="text-xs text-muted">Gera um link para alguém sem login preencher os campos da fase "{phaseName}".</p>
          <Input type="email" aria-label="Enviar para (opcional)" placeholder="E-mail (opcional)" value={sendTo} onChange={(e) => setSendTo(e.target.value)} />
          {sendTo.trim() && <Textarea aria-label="Recado" rows={2} placeholder="Recado (opcional)" value={note} onChange={(e) => setNote(e.target.value)} />}
          <Button size="sm" className="self-start" loading={create.isPending} onClick={() => create.mutate()}>
            <Link2 className="h-4 w-4" aria-hidden="true" /> {sendTo.trim() ? "Gerar e enviar" : "Gerar link"}
          </Button>
        </div>
      )}
      {active.map((l) => (
        <div key={l.id} className="flex items-center gap-2 text-xs">
          <span className="min-w-0 flex-1 truncate text-muted">
            {l.phaseName}{l.sentTo ? ` · ${l.sentTo}` : ""} · {l.submittedAt ? `preenchido ${date(l.submittedAt)}` : "aguardando"}
          </span>
          <button aria-label="Copiar link" onClick={() => { void navigator.clipboard.writeText(l.url); toast("Link copiado", "success"); }} className="rounded p-1 text-muted hover:text-text"><Copy className="h-3.5 w-3.5" /></button>
          <button onClick={() => { if (confirm("Revogar este link? Ele deixa de funcionar.")) revoke.mutate(l.id); }} className="text-muted hover:text-danger">revogar</button>
        </div>
      ))}

      {request && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <p className="text-xs text-muted">Solicitante: <span className="text-text">{request.email ?? "sem e-mail"}</span></p>
          <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
            {request.messages.map((m) => (
              <li key={m.id} className={`rounded p-2 text-xs ${m.fromRequester ? "bg-surface" : "border border-border"}`}>
                <p className="whitespace-pre-wrap text-text">{m.body}</p>
                <p className="mt-0.5 text-muted">{m.authorName} · {date(m.createdAt)}</p>
              </li>
            ))}
            {!request.messages.length && <li className="text-xs text-muted">Sem mensagens.</li>}
          </ul>
          {request.email && (
            <>
              <Textarea aria-label="Responder ao solicitante" rows={2} placeholder="Responder ao solicitante (vai por e-mail)" value={reply} onChange={(e) => setReply(e.target.value)} />
              <Button size="sm" className="self-start" disabled={!reply.trim()} loading={send.isPending} onClick={() => send.mutate()}>
                <Send className="h-4 w-4" aria-hidden="true" /> Responder
              </Button>
            </>
          )}
        </div>
      )}
    </section>
  );
}
