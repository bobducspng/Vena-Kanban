import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Mail, Pencil, Plus, Send, Trash2 } from "lucide-react";
import { api } from "../../data/store";
import type { EmailTemplate, FieldDef } from "../../data/types";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";
import { Textarea } from "../ui/Textarea";
import { useToast } from "../ui/Toast";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado");
const SPECIAL = ["#", "Título", "Fase", "Pipe", "Link do card", "Solicitante", "Responsáveis", "Link de acompanhamento"];
const list = (s: string) => s.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);

/** Clickable {placeholders}: the card's fields + the special ones. */
function Placeholders({ fields, onPick }: { fields: FieldDef[]; onPick: (p: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1">
      {[...SPECIAL, ...fields.filter((f) => !["attachment", "id"].includes(f.type)).map((f) => f.label)].map((p) => (
        <button key={p} type="button" onClick={() => onPick(`{${p}}`)} className="rounded-pill border border-border px-2 py-0.5 text-xs text-muted hover:text-text">{`{${p}}`}</button>
      ))}
    </div>
  );
}

/** Configurar > Templates de e-mail of a pipe (admins). */
export function EmailTemplatesSection({ pipeId, fields }: { pipeId: string; fields: FieldDef[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<EmailTemplate | "new" | null>(null);
  const { data: templates } = useQuery({ queryKey: ["emailTemplates", pipeId], queryFn: () => api.email.templates(pipeId) });
  const { data: enabled } = useQuery({ queryKey: ["emailEnabled"], queryFn: api.email.enabled });
  const remove = useMutation({
    mutationFn: api.email.removeTemplate,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["emailTemplates", pipeId] }),
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <section aria-label="Templates de e-mail" className="flex flex-col gap-3 rounded-lg border border-border bg-bg p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text">Templates de e-mail</h3>
          <p className="text-xs text-muted">Modelos com dados do card, para enviar pelo card ou por automação.</p>
        </div>
        <Button size="sm" onClick={() => setEditing("new")}><Plus className="h-4 w-4" aria-hidden="true" /> Novo template</Button>
      </div>
      {enabled === false && <p className="text-xs text-warning">O envio de e-mail não está configurado na VM.</p>}
      {templates?.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {templates.map((t) => (
            <li key={t.id} className="flex items-center gap-2 px-3 py-2">
              <Mail className="h-4 w-4 text-muted" aria-hidden="true" />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm text-text">{t.name}</p>
                <p className="truncate text-xs text-muted">{t.subject}</p>
              </div>
              <button aria-label={`Editar ${t.name}`} onClick={() => setEditing(t)} className="rounded p-1 text-muted hover:bg-surface"><Pencil className="h-4 w-4" /></button>
              <button aria-label={`Excluir ${t.name}`} onClick={() => { if (confirm(`Excluir o template "${t.name}"?`)) remove.mutate(t.id); }} className="rounded p-1 text-muted hover:bg-surface hover:text-danger"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted">Nenhum template ainda.</p>}
      <TemplateModal pipeId={pipeId} fields={fields} editing={editing} onClose={() => setEditing(null)} />
    </section>
  );
}

function TemplateModal({ pipeId, fields, editing, onClose }: { pipeId: string; fields: FieldDef[]; editing: EmailTemplate | "new" | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const existing = editing && editing !== "new" ? editing : null;
  const [t, setT] = useState({ name: "", toSpec: "", ccSpec: "", subject: "", body: "" });
  const [focus, setFocus] = useState<"toSpec" | "ccSpec" | "subject" | "body">("body");
  useEffect(() => {
    if (editing) setT(existing ? { name: existing.name, toSpec: existing.toSpec, ccSpec: existing.ccSpec, subject: existing.subject, body: existing.body } : { name: "", toSpec: "{Solicitante}", ccSpec: "", subject: "Solicitação #{#}: {Título}", body: "Olá,\n\n\n\nAtenciosamente,\nEquipe Vena" });
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation({
    mutationFn: async (): Promise<unknown> => (existing ? api.email.updateTemplate({ templateId: existing.id, ...t }) : api.email.createTemplate({ pipeId, ...t })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["emailTemplates", pipeId] }); toast("Template salvo", "success"); onClose(); },
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <Modal open={!!editing} onOpenChange={(o) => !o && onClose()} title={existing ? "Editar template" : "Novo template"} size="wide"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!t.name.trim() || !t.subject.trim() || !t.body.trim()}>Salvar</Button></>}>
      <div className="flex flex-col gap-3">
        <Input aria-label="Nome do template" placeholder="Nome (ex.: Pedido aprovado)" value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} />
        <Input aria-label="Para" placeholder="Para: e-mails ou {Campo de e-mail}, {Solicitante}, {Responsáveis}" value={t.toSpec} onFocus={() => setFocus("toSpec")} onChange={(e) => setT({ ...t, toSpec: e.target.value })} />
        <Input aria-label="Cópia" placeholder="Cópia (opcional)" value={t.ccSpec} onFocus={() => setFocus("ccSpec")} onChange={(e) => setT({ ...t, ccSpec: e.target.value })} />
        <Input aria-label="Assunto" placeholder="Assunto" value={t.subject} onFocus={() => setFocus("subject")} onChange={(e) => setT({ ...t, subject: e.target.value })} />
        <Textarea aria-label="Corpo" rows={10} value={t.body} onFocus={() => setFocus("body")} onChange={(e) => setT({ ...t, body: e.target.value })} />
        <p className="text-xs text-muted">Clique para inserir no campo selecionado ({focus === "body" ? "corpo" : focus === "subject" ? "assunto" : focus === "toSpec" ? "para" : "cópia"}):</p>
        <Placeholders fields={fields} onPick={(p) => setT((x) => ({ ...x, [focus]: `${x[focus]}${p}` }))} />
      </div>
    </Modal>
  );
}

/** Card > E-mails: history + "Enviar e-mail" (template or free text, card attachments). */
export function EmailsSection({ cardId, pipeId }: { cardId: string; pipeId: string }) {
  const [open, setOpen] = useState(false);
  const { data: history } = useQuery({ queryKey: ["cardEmails", cardId], queryFn: () => api.email.history(cardId) });
  const { data: enabled } = useQuery({ queryKey: ["emailEnabled"], queryFn: api.email.enabled });
  return (
    <section aria-label="E-mails" className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">E-mails</h3>
        {enabled && <button className="text-xs text-accent" onClick={() => setOpen(true)}>Enviar e-mail</button>}
      </div>
      {!history?.length ? <p className="text-xs text-muted">{enabled ? "Nenhum e-mail enviado." : "Envio de e-mail não configurado."}</p> : (
        <ul className="flex max-h-56 flex-col gap-1.5 overflow-y-auto">
          {history.map((e) => (
            <li key={e.id} className="rounded border border-border p-2 text-xs">
              <details>
                <summary className="cursor-pointer">
                  <span className={e.status === "failed" ? "text-danger" : "text-text"}>{e.subject}</span>
                  <span className="block text-muted">para {e.toList} · {new Date(e.createdAt).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })}{e.via ? ` · automação "${e.via}"` : ""}{e.status === "failed" ? ` · falhou: ${e.error}` : ""}</span>
                </summary>
                <p className="mt-1 whitespace-pre-wrap text-muted">{e.body}</p>
              </details>
            </li>
          ))}
        </ul>
      )}
      <SendModal open={open} cardId={cardId} pipeId={pipeId} onClose={() => setOpen(false)} />
    </section>
  );
}

function SendModal({ open, cardId, pipeId, onClose }: { open: boolean; cardId: string; pipeId: string; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [templateId, setTemplateId] = useState("");
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const { data: templates } = useQuery({ queryKey: ["emailTemplates", pipeId], queryFn: () => api.email.templates(pipeId), enabled: open });
  const { data: attachments } = useQuery({ queryKey: ["files", cardId], queryFn: () => api.file.listByCard(cardId), enabled: open });
  useEffect(() => { if (open) { setTemplateId(""); setTo(""); setCc(""); setSubject(""); setBody(""); setFiles([]); } }, [open]);

  const pick = async (id: string) => {
    setTemplateId(id);
    try {
      const r = await api.email.render(id, cardId);
      setTo(r.to.join(", ")); setCc(r.cc.join(", ")); setSubject(r.subject); setBody(r.body);
    } catch (e) { toast(errMsg(e), "error"); }
  };
  const send = useMutation({
    mutationFn: () => api.email.send({ cardId, to: list(to), cc: list(cc), subject: subject.trim(), body, attachmentIds: files, templateId: templateId || undefined }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["cardEmails", cardId] }); qc.invalidateQueries({ queryKey: ["events", cardId] }); toast("E-mail enviado", "success"); onClose(); },
    onError: (e) => toast(errMsg(e), "error"),
  });

  return (
    <Modal open={open} onOpenChange={(o) => !o && onClose()} title="Enviar e-mail" description="As respostas chegam no seu e-mail." size="wide"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button onClick={() => send.mutate()} loading={send.isPending} disabled={!list(to).length || !subject.trim() || !body.trim()}><Send className="h-4 w-4" aria-hidden="true" /> Enviar</Button></>}>
      <div className="flex flex-col gap-3">
        {!!templates?.length && (
          <Select aria-label="Template" value={templateId || undefined} placeholder="Usar um template (opcional)" onValueChange={(v) => void pick(v)}
            options={templates.map((t) => ({ value: t.id, label: t.name }))} />
        )}
        <Input aria-label="Para" placeholder="Para (separe por vírgula)" value={to} onChange={(e) => setTo(e.target.value)} />
        <Input aria-label="Cópia" placeholder="Cópia (opcional)" value={cc} onChange={(e) => setCc(e.target.value)} />
        <Input aria-label="Assunto" placeholder="Assunto" value={subject} onChange={(e) => setSubject(e.target.value)} />
        <Textarea aria-label="Mensagem" rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
        {!!attachments?.length && (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-xs font-medium text-muted">Anexar arquivos do card</legend>
            {attachments.map((a) => (
              <label key={a.id} className="inline-flex items-center gap-2 text-sm text-text">
                <input type="checkbox" className="h-4 w-4 accent-accent" checked={files.includes(a.id)}
                  onChange={(e) => setFiles((f) => (e.target.checked ? [...f, a.id] : f.filter((x) => x !== a.id)))} />
                {a.filename}
              </label>
            ))}
          </fieldset>
        )}
        <p className="text-xs text-muted">Até 500 destinatários (limite do Google, somando Para e Cópia) e 20 MB de anexos.</p>
      </div>
    </Modal>
  );
}
