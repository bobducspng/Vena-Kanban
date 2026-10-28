import { useId, useRef } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Paperclip, X } from "lucide-react";
import type { FieldDef, CardFieldValue } from "../../data/types";
import { api } from "../../data/store";
import { isValidDocument, maskDocument } from "../../lib/document";
import { cn } from "../../lib/cn";
import { Input } from "./Input";
import { Textarea } from "./Textarea";
import { Select } from "./Select";
import { Tag } from "./Tag";
import { Avatar } from "./Avatar";
import { Button } from "./Button";
import { useToast } from "./Toast";

type Value = CardFieldValue["value"];

interface FieldProps {
  def: FieldDef;
  value: Value | undefined;
  onChange: (value: Value) => void;
  error?: string;
  /** Read-only (e.g. a past phase's field that is not "editável em outras fases"). */
  disabled?: boolean;
  /** The card being edited; absent in the start form (card not created yet). */
  card?: { id: string; number: number };
}

const asList = (v: Value | undefined): string[] => (Array.isArray(v) ? v : []);

/** Client-side mirror of the server's format rules, shown while typing. */
function formatError(def: FieldDef, value: Value | undefined): string | undefined {
  if (typeof value !== "string" || value === "") return undefined;
  if (def.type === "document" && !isValidDocument(value)) return "CPF/CNPJ inválido";
  if (!def.validationRegex) return undefined;
  try {
    return new RegExp(def.validationRegex).test(value) ? undefined : "Formato inválido";
  } catch {
    return undefined;
  }
}

/** Renders one field by its type, with a label, required marker, description, help and error.
 *  Required is signalled with text + aria-required, never colour alone. */
export function Field({ def, value, onChange, error, disabled, card }: FieldProps) {
  const id = useId();
  const errId = `${id}-err`;
  const helpId = `${id}-help`;
  const shownError = error || formatError(def, value);
  const describedBy = [shownError ? errId : null, def.help ? helpId : null].filter(Boolean).join(" ") || undefined;
  const common = {
    id,
    disabled,
    invalid: !!shownError,
    "aria-required": def.required || undefined,
    "aria-describedby": describedBy,
  };
  const required = def.required && (
    <span className="ml-1 text-muted">(obrigatório)<span className="text-danger" aria-hidden="true"> *</span></span>
  );
  const footer = (
    <>
      {def.help && <p id={helpId} className="text-xs text-muted">{def.help}</p>}
      {shownError && <p id={errId} className="text-xs text-danger">{shownError}</p>}
    </>
  );
  const description = def.description && <p className="-mt-1 whitespace-pre-line text-xs text-muted">{def.description}</p>;

  if (def.type === "checkbox") {
    return (
      <div className="flex flex-col gap-1.5">
        <label htmlFor={id} className="inline-flex items-center gap-2 text-sm font-medium text-text">
          <input id={id} type="checkbox" className="h-4 w-4 accent-accent disabled:opacity-60" checked={value === true} disabled={disabled}
            aria-required={def.required || undefined} aria-describedby={describedBy} onChange={(e) => onChange(e.target.checked)} />
          {def.label}
          {def.required && <span className="text-muted">(obrigatório)</span>}
        </label>
        {description}
        {footer}
      </div>
    );
  }

  // Option groups: radio (one) and checklist (many), plus the pickers (people, labels).
  if (def.type === "radio" || def.type === "checklist" || def.type === "assignee_select" || def.type === "label_select") {
    return (
      <fieldset className="flex flex-col gap-1.5" aria-describedby={describedBy} disabled={disabled}>
        <legend className="text-sm font-medium text-text">{def.label}{required}</legend>
        {description}
        {def.type === "radio" && (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5">
            {(def.options ?? []).map((o) => (
              <label key={o} className="inline-flex items-center gap-2 text-sm text-text">
                <input type="radio" name={id} className="h-4 w-4 accent-accent" checked={value === o} onChange={() => onChange(o)} />
                {o}
              </label>
            ))}
          </div>
        )}
        {def.type === "checklist" && (
          <div className="flex flex-col gap-1.5">
            {(def.options ?? []).map((o) => {
              const list = asList(value);
              return (
                <label key={o} className="inline-flex items-center gap-2 text-sm text-text">
                  <input type="checkbox" className="h-4 w-4 accent-accent" checked={list.includes(o)}
                    onChange={(e) => onChange(e.target.checked ? [...list, o] : list.filter((x) => x !== o))} />
                  {o}
                </label>
              );
            })}
          </div>
        )}
        {def.type === "assignee_select" && <PeoplePicker value={asList(value)} onChange={onChange} disabled={disabled} />}
        {def.type === "label_select" && <LabelPicker pipeId={def.pipeId} value={asList(value)} onChange={onChange} disabled={disabled} />}
        {footer}
      </fieldset>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text">{def.label}{required}</label>
      {description}

      {def.type === "long_text" ? (
        <Textarea {...common} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      ) : def.type === "select" ? (
        <Select id={id} invalid={!!shownError} disabled={disabled} value={(value as string) ?? undefined} onValueChange={onChange}
          options={(def.options ?? []).map((o) => ({ value: o, label: o }))} />
      ) : def.type === "currency" || def.type === "number" ? (
        <Input {...common} type="number" inputMode="decimal" value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))} />
      ) : def.type === "date" || def.type === "due_date" ? (
        <Input {...common} type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      ) : def.type === "datetime" ? (
        <Input {...common} type="datetime-local" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      ) : def.type === "time" ? (
        <Input {...common} type="time" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} className="w-36" />
      ) : def.type === "email" ? (
        <Input {...common} type="email" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      ) : def.type === "phone" ? (
        <Input {...common} type="tel" inputMode="tel" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      ) : def.type === "document" ? (
        <Input {...common} inputMode="numeric" placeholder="000.000.000-00 ou 00.000.000/0000-00" value={(value as string) ?? ""}
          onChange={(e) => onChange(maskDocument(e.target.value))} />
      ) : def.type === "id" ? (
        <p id={id} className="text-sm text-text">{card ? `#${card.number}` : <span className="text-muted">Gerado ao criar o card</span>}</p>
      ) : def.type === "attachment" ? (
        card ? <FieldAttachments cardId={card.id} fieldId={def.id} disabled={disabled} />
          : <p className="text-sm text-muted">Anexe depois de criar o card.</p>
      ) : (
        <Input {...common} type="text" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      )}

      {footer}
    </div>
  );
}

/** Toggle org members (value = user ids). */
function PeoplePicker({ value, onChange, disabled }: { value: string[]; onChange: (v: Value) => void; disabled?: boolean }) {
  const { data: members } = useQuery({ queryKey: ["users"], queryFn: api.user.list });
  return (
    <div className="flex flex-wrap gap-2">
      {(members ?? []).map((u) => {
        const on = value.includes(u.id);
        return (
          <button type="button" key={u.id} disabled={disabled} aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== u.id) : [...value, u.id])}
            className={cn("inline-flex items-center gap-1.5 rounded-pill border px-2 py-1 text-sm", on ? "border-accent bg-surface text-text" : "border-border text-muted hover:text-text")}>
            <Avatar name={u.name} color={u.avatarColor} size="sm" /> {u.name}
          </button>
        );
      })}
    </div>
  );
}

/** Toggle the pipe's labels (value = label ids). */
function LabelPicker({ pipeId, value, onChange, disabled }: { pipeId: string; value: string[]; onChange: (v: Value) => void; disabled?: boolean }) {
  const { data: labels } = useQuery({ queryKey: ["labels", pipeId], queryFn: () => api.label.listByPipe(pipeId) });
  if (labels && labels.length === 0) return <p className="text-sm text-muted">Este pipe não tem etiquetas.</p>;
  return (
    <div className="flex flex-wrap gap-2">
      {(labels ?? []).map((l) => {
        const on = value.includes(l.id);
        return (
          <button type="button" key={l.id} disabled={disabled} aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== l.id) : [...value, l.id])}
            className={cn("rounded-pill outline-offset-2", on ? "outline outline-2 outline-accent" : "opacity-60 hover:opacity-100")}>
            <Tag color={l.color}>{l.name}</Tag>
          </button>
        );
      })}
    </div>
  );
}

/** Files of an "Anexo" field: upload/remove go straight to the server (it keeps the value). */
function FieldAttachments({ cardId, fieldId, disabled }: { cardId: string; fieldId: string; disabled?: boolean }) {
  const qc = useQueryClient();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const key = ["files", cardId, fieldId];
  const { data: files } = useQuery({ queryKey: key, queryFn: () => api.file.listByCard(cardId, fieldId) });
  const done = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["card", cardId] }); };
  const err = (e: unknown) => { done(); toast(e instanceof Error ? e.message : "Falha no envio", "error"); };
  const upload = useMutation({ mutationFn: async (l: File[]) => { for (const f of l) await api.file.upload(cardId, f, fieldId); }, onSuccess: done, onError: err });
  const remove = useMutation({ mutationFn: api.file.remove, onSuccess: done, onError: err });
  return (
    <div className="flex flex-col gap-1.5">
      {files?.map((f) => (
        <div key={f.id} className="flex items-center gap-2 text-sm">
          <a href={api.file.url(f.id)} target="_blank" rel="noreferrer" className="min-w-0 flex-1 truncate text-accent hover:underline">{f.filename}</a>
          {!disabled && <button type="button" aria-label={`Remover ${f.filename}`} onClick={() => remove.mutate(f.id)} className="rounded p-0.5 text-muted hover:text-danger"><X className="h-4 w-4" /></button>}
        </div>
      ))}
      {!disabled && (
        <>
          <input ref={input} type="file" multiple hidden onChange={(e) => { const l = Array.from(e.target.files ?? []); e.target.value = ""; if (l.length) upload.mutate(l); }} />
          <Button type="button" size="sm" variant="secondary" className="self-start" loading={upload.isPending} onClick={() => input.current?.click()}>
            <Paperclip className="h-4 w-4" aria-hidden="true" /> Anexar arquivo
          </Button>
        </>
      )}
    </div>
  );
}
