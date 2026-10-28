import { useRef, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Paperclip, Plus, Trash2, X, CalendarClock, Download } from "lucide-react";
import { api } from "../../data/store";
import type { Card, User } from "../../data/types";
import { useMe } from "../../lib/useMe";
import { cn } from "../../lib/cn";
import { Avatar } from "../ui/Avatar";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Tag } from "../ui/Tag";
import { Textarea } from "../ui/Textarea";
import { useToast } from "../ui/Toast";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado");

/** Due-date status, shared by the open card and the board tile:
 *  overdue = past and not done; soon = within 2 days; otherwise ok. */
export function dueStatus(card: Pick<Card, "dueDate" | "done">): "overdue" | "soon" | "ok" | null {
  if (!card.dueDate) return null;
  if (card.done) return "ok";
  const ms = new Date(card.dueDate).getTime() - Date.now();
  if (ms < 0) return "overdue";
  return ms <= 2 * 24 * 3600 * 1000 ? "soon" : "ok";
}
export const DUE_CLASS = { overdue: "text-danger", soon: "text-warning", ok: "text-muted" } as const;
export const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR");

function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">{title}</h3>
        {action}
      </div>
      {children}
    </section>
  );
}

/** Pick assignees among org members (toggle chips). */
export function AssigneesSection({ card, members, onChanged }: { card: Card; members: User[]; onChanged: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const save = useMutation({ mutationFn: (ids: string[]) => api.card.setAssignees(card.id, ids), onSuccess: onChanged, onError: (e) => toast(errMsg(e), "error") });
  const toggle = (id: string) => save.mutate(card.assigneeIds.includes(id) ? card.assigneeIds.filter((x) => x !== id) : [...card.assigneeIds, id]);
  const chosen = members.filter((m) => card.assigneeIds.includes(m.id));

  return (
    <Section title="Responsáveis" action={<button className="text-xs text-accent" onClick={() => setOpen((o) => !o)}>{open ? "Fechar" : "Editar"}</button>}>
      {chosen.length === 0 && !open && <p className="text-sm text-muted">Ninguém atribuído.</p>}
      {!open && (
        <ul className="flex flex-wrap gap-2">
          {chosen.map((u) => (
            <li key={u.id} className="inline-flex items-center gap-1.5 text-sm text-text"><Avatar name={u.name} color={u.avatarColor} size="sm" />{u.name}</li>
          ))}
        </ul>
      )}
      {open && (
        <ul className="flex flex-col gap-1">
          {members.map((u) => {
            const on = card.assigneeIds.includes(u.id);
            return (
              <li key={u.id}>
                <button disabled={save.isPending} onClick={() => toggle(u.id)} className={cn("flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface", on && "bg-surface")}>
                  <Avatar name={u.name} color={u.avatarColor} size="sm" />
                  <span className="flex-1 truncate text-text">{u.name}</span>
                  {on && <Check className="h-4 w-4 text-accent" aria-label="atribuído" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </Section>
  );
}

/** Attach / detach the pipe's labels. */
export function LabelsSection({ card, pipeId, onChanged }: { card: Card; pipeId: string; onChanged: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const { data: labels } = useQuery({ queryKey: ["labels", pipeId], queryFn: () => api.label.listByPipe(pipeId) });
  const save = useMutation({ mutationFn: (ids: string[]) => api.card.setLabels(card.id, ids), onSuccess: onChanged, onError: (e) => toast(errMsg(e), "error") });
  const chosen = (labels ?? []).filter((l) => card.labelIds.includes(l.id));

  return (
    <Section title="Etiquetas" action={<button className="text-xs text-accent" onClick={() => setOpen((o) => !o)}>{open ? "Fechar" : "Editar"}</button>}>
      {!open && (chosen.length ? (
        <div className="flex flex-wrap gap-1.5">{chosen.map((l) => <Tag key={l.id} color={l.color}>{l.name}</Tag>)}</div>
      ) : <p className="text-sm text-muted">Sem etiquetas.</p>)}
      {open && ((labels ?? []).length === 0 ? (
        <p className="text-sm text-muted">Este pipe não tem etiquetas. Um administrador cria em Configurar.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {labels!.map((l) => {
            const on = card.labelIds.includes(l.id);
            return (
              <button key={l.id} disabled={save.isPending} aria-pressed={on}
                onClick={() => save.mutate(on ? card.labelIds.filter((x) => x !== l.id) : [...card.labelIds, l.id])}
                className={cn("rounded-pill outline-offset-2", on ? "outline outline-2 outline-accent" : "opacity-60 hover:opacity-100")}>
                <Tag color={l.color}>{l.name}</Tag>
              </button>
            );
          })}
        </div>
      ))}
    </Section>
  );
}

/** The card's own due date (feeds the overdue colours; SLA alerts come in M6). */
export function DueDateSection({ card, onChanged }: { card: Card; onChanged: () => void }) {
  const toast = useToast();
  const save = useMutation({
    // Picked day → end of that day, local time.
    mutationFn: (day: string) => api.card.update({ cardId: card.id, dueDate: day ? new Date(`${day}T23:59:00`).toISOString() : null }),
    onSuccess: onChanged,
    onError: (e) => toast(errMsg(e), "error"),
  });
  const status = dueStatus(card);
  const day = card.dueDate ? new Date(card.dueDate).toLocaleDateString("en-CA") : ""; // yyyy-mm-dd

  return (
    <Section title="Vencimento">
      <div className="flex items-center gap-2">
        <CalendarClock className={cn("h-4 w-4", status ? DUE_CLASS[status] : "text-muted")} aria-hidden="true" />
        <Input type="date" aria-label="Data de vencimento" value={day} onChange={(e) => save.mutate(e.target.value)} className="w-44" />
        {status === "overdue" && <span className="text-xs font-medium text-danger">Vencido</span>}
        {status === "soon" && <span className={cn("text-xs font-medium", DUE_CLASS.soon)}>Vence em breve</span>}
      </div>
    </Section>
  );
}

export function ChecklistSection({ cardId, onChanged }: { cardId: string; onChanged: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState("");
  const { data: items } = useQuery({ queryKey: ["checklist", cardId], queryFn: () => api.checklist.listByCard(cardId) });
  const done = () => { qc.invalidateQueries({ queryKey: ["checklist", cardId] }); onChanged(); };
  const onError = (e: unknown) => toast(errMsg(e), "error");
  const add = useMutation({ mutationFn: () => api.checklist.add(cardId, text.trim()), onSuccess: () => { setText(""); done(); }, onError });
  const update = useMutation({ mutationFn: api.checklist.update, onSuccess: done, onError });
  const remove = useMutation({ mutationFn: api.checklist.remove, onSuccess: done, onError });
  const total = items?.length ?? 0;
  const checked = items?.filter((i) => i.done).length ?? 0;

  return (
    <Section title={total ? `Checklist (${checked}/${total})` : "Checklist"}>
      {total > 0 && (
        <div className="h-1.5 overflow-hidden rounded-pill bg-surface" aria-hidden="true">
          <div className="h-full bg-accent" style={{ width: `${(checked / total) * 100}%` }} />
        </div>
      )}
      <ul className="flex flex-col gap-1">
        {items?.map((i) => (
          <li key={i.id} className="group flex items-center gap-2">
            <input type="checkbox" className="h-4 w-4 accent-accent" checked={i.done} aria-label={i.text}
              onChange={(e) => update.mutate({ itemId: i.id, done: e.target.checked })} />
            <span className={cn("flex-1 text-sm text-text", i.done && "text-muted line-through")}>{i.text}</span>
            <button aria-label={`Remover ${i.text}`} onClick={() => remove.mutate(i.id)} className="rounded p-0.5 text-muted opacity-0 hover:text-danger focus:opacity-100 group-hover:opacity-100">
              <X className="h-4 w-4" />
            </button>
          </li>
        ))}
      </ul>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (text.trim()) add.mutate(); }}>
        <Input aria-label="Novo item da checklist" placeholder="Adicionar item" value={text} onChange={(e) => setText(e.target.value)} />
        <Button type="submit" size="md" variant="secondary" disabled={!text.trim()} loading={add.isPending}><Plus className="h-4 w-4" aria-hidden="true" /></Button>
      </form>
    </Section>
  );
}

const fmtSize = (n: number | null) => (n == null ? "" : n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

export function AttachmentsSection({ cardId, onChanged }: { cardId: string; onChanged: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { me, isAdmin } = useMe();
  const input = useRef<HTMLInputElement>(null);
  const { data: files } = useQuery({ queryKey: ["files", cardId], queryFn: () => api.file.listByCard(cardId) });
  const done = () => { qc.invalidateQueries({ queryKey: ["files", cardId] }); onChanged(); };
  const upload = useMutation({
    mutationFn: async (list: File[]) => { for (const f of list) await api.file.upload(cardId, f); },
    onSuccess: () => { done(); toast("Anexo enviado", "success"); },
    onError: (e) => { done(); toast(errMsg(e), "error"); },
  });
  const remove = useMutation({ mutationFn: api.file.remove, onSuccess: done, onError: (e) => toast(errMsg(e), "error") });

  return (
    <Section title="Anexos" action={
      <>
        <input ref={input} type="file" multiple hidden onChange={(e) => { const l = Array.from(e.target.files ?? []); e.target.value = ""; if (l.length) upload.mutate(l); }} />
        <Button size="sm" variant="secondary" loading={upload.isPending} onClick={() => input.current?.click()}><Paperclip className="h-4 w-4" aria-hidden="true" /> Anexar</Button>
      </>
    }>
      {!files?.length ? <p className="text-sm text-muted">Nenhum arquivo. Limite de 25 MB por arquivo.</p> : (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {files.map((f) => (
            <li key={f.id} className="flex items-center gap-2 px-3 py-2">
              <a href={api.file.url(f.id)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-sm text-accent hover:underline">{f.filename}</a>
              <span className="text-xs text-muted">{fmtSize(f.sizeBytes)}</span>
              <a href={api.file.url(f.id)} download aria-label={`Baixar ${f.filename}`} className="rounded p-1 text-muted hover:bg-surface"><Download className="h-4 w-4" /></a>
              {(f.uploadedBy === me?.id || isAdmin) && (
                <button aria-label={`Excluir ${f.filename}`} onClick={() => { if (confirm(`Excluir "${f.filename}"?`)) remove.mutate(f.id); }} className="rounded p-1 text-muted hover:bg-surface hover:text-danger"><Trash2 className="h-4 w-4" /></button>
              )}
            </li>
          ))}
        </ul>
      )}
    </Section>
  );
}

/** Comments with "@" mentions: typing @ opens a member list; picking one inserts @Nome
 *  and records the user id (notifications come in M6). */
export function CommentsSection({ cardId, members, onChanged }: { cardId: string; members: User[]; onChanged: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { me, isAdmin } = useMe();
  const [body, setBody] = useState("");
  const [mentions, setMentions] = useState<string[]>([]);
  const { data: list } = useQuery({ queryKey: ["comments", cardId], queryFn: () => api.comment.listByCard(cardId) });
  const done = () => { qc.invalidateQueries({ queryKey: ["comments", cardId] }); onChanged(); };
  const post = useMutation({
    // Keep only mentions whose @Nome is still in the text.
    mutationFn: () => api.comment.create({ cardId, body: body.trim(), mentions: mentions.filter((id) => body.includes(`@${members.find((m) => m.id === id)?.name}`)) }),
    onSuccess: () => { setBody(""); setMentions([]); done(); },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const remove = useMutation({ mutationFn: api.comment.remove, onSuccess: done, onError: (e) => toast(errMsg(e), "error") });
  const byId = new Map(members.map((m) => [m.id, m]));

  // "@abc" being typed at the end of the text → suggestions.
  const match = /(^|\s)@([^\s@]*)$/.exec(body);
  const suggestions = match ? members.filter((m) => m.name.toLowerCase().includes(match[2].toLowerCase())).slice(0, 6) : [];
  const pick = (u: User) => {
    setBody(body.replace(/@([^\s@]*)$/, `@${u.name} `));
    setMentions((m) => (m.includes(u.id) ? m : [...m, u.id]));
  };

  return (
    <Section title="Comentários">
      <ul className="flex flex-col gap-3">
        {list?.map((c) => {
          const author = c.authorId ? byId.get(c.authorId) : undefined;
          return (
            <li key={c.id} className="flex gap-2">
              <Avatar name={author?.name ?? "Usuário"} color={author?.avatarColor} size="sm" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted">
                  <span className="font-medium text-text">{author?.name ?? "Usuário"}</span> · {new Date(c.createdAt).toLocaleString("pt-BR")}
                  {(c.authorId === me?.id || isAdmin) && (
                    <button className="ml-2 text-muted hover:text-danger" onClick={() => { if (confirm("Excluir comentário?")) remove.mutate(c.id); }}>excluir</button>
                  )}
                </p>
                <p className="whitespace-pre-wrap break-words text-sm text-text">{c.body}</p>
              </div>
            </li>
          );
        })}
      </ul>
      <div className="relative">
        <Textarea aria-label="Novo comentário" rows={2} placeholder="Escreva um comentário. Use @ para mencionar alguém." value={body}
          onChange={(e) => setBody(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && body.trim()) post.mutate(); }} />
        {suggestions.length > 0 && (
          <ul role="listbox" aria-label="Mencionar" className="absolute bottom-full left-0 z-10 mb-1 w-64 rounded-md border border-border bg-surface-raised p-1 shadow-pop">
            {suggestions.map((u) => (
              <li key={u.id}>
                <button type="button" onClick={() => pick(u)} className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-surface">
                  <Avatar name={u.name} color={u.avatarColor} size="sm" /> {u.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="flex justify-end">
        <Button size="sm" disabled={!body.trim()} loading={post.isPending} onClick={() => post.mutate()}>Comentar</Button>
      </div>
    </Section>
  );
}
