import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Clock, Plus, Trash2 } from "lucide-react";
import { api } from "../../data/store";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";
import { Textarea } from "../ui/Textarea";
import { useToast } from "../ui/Toast";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado");
const when = (d: Date | string) => new Date(d).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
const STATUS: Record<string, string> = { pending: "Aguardando assinaturas", completed: "Assinado por todos", cancelled: "Cancelado" };

/** Card > Assinaturas: requests of the card, who signed, "Pedir assinatura". */
export function SignaturesSection({ cardId }: { cardId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const { data: list } = useQuery({ queryKey: ["signatures", cardId], queryFn: () => api.signature.listByCard(cardId) });
  const { data: mail } = useQuery({ queryKey: ["emailEnabled"], queryFn: api.email.enabled });
  const refresh = () => { qc.invalidateQueries({ queryKey: ["signatures", cardId] }); qc.invalidateQueries({ queryKey: ["files", cardId] }); };
  const cancel = useMutation({ mutationFn: api.signature.cancel, onSuccess: refresh, onError: (e) => toast(errMsg(e), "error") });
  const resend = useMutation({ mutationFn: api.signature.resend, onSuccess: () => toast("Link reenviado", "success"), onError: (e) => toast(errMsg(e), "error") });

  return (
    <section aria-label="Assinaturas" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">Assinaturas</h3>
        {mail && <button className="text-xs text-accent" onClick={() => setOpen(true)}>Pedir assinatura</button>}
      </div>
      {!list?.length ? (
        <p className="text-xs text-muted">{mail ? "Gere ou anexe um PDF e peça a assinatura por e-mail." : "Precisa do envio de e-mail configurado."}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {list.map((r) => (
            <li key={r.id} className="rounded border border-border p-2 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="font-medium text-text">{r.title}</span>
                <span className={r.status === "completed" ? "text-success" : r.status === "cancelled" ? "text-muted" : "text-warning"}>{STATUS[r.status] ?? r.status}</span>
              </div>
              <ul className="mt-1 flex flex-col gap-0.5">
                {r.signers.map((s) => (
                  <li key={s.id} className="flex items-center gap-1.5 text-muted">
                    {s.signedAt ? <CheckCircle2 className="h-3.5 w-3.5 text-success" aria-label="Assinou" /> : <Clock className="h-3.5 w-3.5" aria-label="Pendente" />}
                    <span className="min-w-0 flex-1 truncate">{s.name} ({s.email}){s.signedAt ? ` · ${when(s.signedAt)}` : s.viewedAt ? " · abriu o link" : ""}</span>
                    {r.status === "pending" && !s.signedAt && <button className="text-accent" onClick={() => resend.mutate(s.id)}>reenviar</button>}
                  </li>
                ))}
              </ul>
              <div className="mt-1 flex flex-wrap gap-3">
                {r.signedAttachmentId && <a className="text-accent hover:underline" href={api.file.url(r.signedAttachmentId)} target="_blank" rel="noreferrer">Abrir via assinada</a>}
                <span className="text-muted">código {r.code}</span>
                {r.status === "pending" && <button className="text-danger" onClick={() => { if (confirm("Cancelar este pedido? Os links param de funcionar.")) cancel.mutate(r.id); }}>cancelar pedido</button>}
              </div>
            </li>
          ))}
        </ul>
      )}
      <RequestModal open={open} cardId={cardId} onClose={() => setOpen(false)} onDone={refresh} />
    </section>
  );
}

function RequestModal({ open, cardId, onClose, onDone }: { open: boolean; cardId: string; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [fileId, setFileId] = useState("");
  const [message, setMessage] = useState("");
  const [signers, setSigners] = useState([{ name: "", email: "" }]);
  const { data: files } = useQuery({ queryKey: ["files", cardId], queryFn: () => api.file.listByCard(cardId), enabled: open });
  const pdfs = (files ?? []).filter((f) => f.mimeType === "application/pdf" || f.filename.toLowerCase().endsWith(".pdf"));
  const valid = fileId && signers.every((s) => s.name.trim().length >= 3 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s.email.trim()));
  const send = useMutation({
    mutationFn: () => api.signature.create({ cardId, attachmentId: fileId, message: message.trim() || undefined, signers }),
    onSuccess: (r) => {
      onDone(); onClose(); setFileId(""); setMessage(""); setSigners([{ name: "", email: "" }]);
      toast(r.emailed === r.total ? `Enviado para ${r.total} pessoa(s)` : `Pedido criado, mas só ${r.emailed} de ${r.total} e-mails saíram. Use "reenviar".`, r.emailed === r.total ? "success" : "error");
    },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const set = (i: number, k: "name" | "email", v: string) => setSigners((l) => l.map((s, j) => (j === i ? { ...s, [k]: v } : s)));

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="Pedir assinatura" size="wide"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={() => send.mutate()} loading={send.isPending} disabled={!valid}>Enviar para assinatura</Button></>}>
      <div className="flex flex-col gap-3">
        {pdfs.length === 0 ? (
          <p className="text-sm text-muted">Este card não tem PDF. Use <strong>Anexos → Gerar PDF</strong> ou anexe um PDF e volte aqui.</p>
        ) : (
          <Select aria-label="Documento" placeholder="Qual PDF será assinado?" value={fileId || undefined} onValueChange={setFileId}
            options={pdfs.map((f) => ({ value: f.id, label: f.filename }))} />
        )}
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm font-medium text-text">Quem assina</legend>
          {signers.map((s, i) => (
            <div key={i} className="flex flex-wrap gap-2">
              <div className="min-w-40 flex-1"><Input aria-label={`Nome completo ${i + 1}`} placeholder="Nome completo" value={s.name} onChange={(e) => set(i, "name", e.target.value)} /></div>
              <div className="min-w-48 flex-1"><Input aria-label={`E-mail ${i + 1}`} type="email" placeholder="E-mail" value={s.email} onChange={(e) => set(i, "email", e.target.value)} /></div>
              {signers.length > 1 && <button aria-label={`Remover signatário ${i + 1}`} onClick={() => setSigners((l) => l.filter((_, j) => j !== i))} className="rounded p-2 text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button>}
            </div>
          ))}
          {signers.length < 30 && <Button size="sm" variant="ghost" className="self-start" onClick={() => setSigners((l) => [...l, { name: "", email: "" }])}><Plus className="h-4 w-4" aria-hidden="true" /> Adicionar signatário</Button>}
          <p className="text-xs text-muted">Cada pessoa recebe um link pessoal por e-mail e confirma digitando o nome completo exatamente como está aqui.</p>
        </fieldset>
        <Textarea aria-label="Mensagem (opcional)" rows={3} placeholder="Mensagem no e-mail (opcional)" value={message} onChange={(e) => setMessage(e.target.value)} />
      </div>
    </Modal>
  );
}
