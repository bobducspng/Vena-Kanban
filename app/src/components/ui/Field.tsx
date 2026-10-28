import { useId } from "react";
import type { FieldDef, CardFieldValue } from "../../data/types";
import { Input } from "./Input";
import { Textarea } from "./Textarea";
import { Select } from "./Select";

interface FieldProps {
  def: FieldDef;
  value: CardFieldValue["value"] | undefined;
  onChange: (value: CardFieldValue["value"]) => void;
  error?: string;
  /** Read-only (e.g. a past phase's field that is not "editável em outras fases"). */
  disabled?: boolean;
}

/** Client-side mirror of the server's regex rule, so the user sees it while typing. */
function regexError(def: FieldDef, value: CardFieldValue["value"] | undefined): string | undefined {
  if (!def.validationRegex || typeof value !== "string" || value === "") return undefined;
  try {
    return new RegExp(def.validationRegex).test(value) ? undefined : "Formato inválido";
  } catch {
    return undefined;
  }
}

/** Renders one field by its type, with a label, required marker, description, help and error.
 *  Required is signalled with text + aria-required, never colour alone. */
export function Field({ def, value, onChange, error, disabled }: FieldProps) {
  const id = useId();
  const errId = `${id}-err`;
  const helpId = `${id}-help`;
  const shownError = error || regexError(def, value);
  const describedBy = [shownError ? errId : null, def.help ? helpId : null].filter(Boolean).join(" ") || undefined;
  const common = {
    id,
    disabled,
    invalid: !!shownError,
    "aria-required": def.required || undefined,
    "aria-describedby": describedBy,
  };

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
          <input
            id={id}
            type="checkbox"
            className="h-4 w-4 accent-accent disabled:opacity-60"
            checked={value === true}
            disabled={disabled}
            aria-required={def.required || undefined}
            aria-describedby={describedBy}
            onChange={(e) => onChange(e.target.checked)}
          />
          {def.label}
          {def.required && <span className="text-muted">(obrigatório)</span>}
        </label>
        {description}
        {footer}
      </div>
    );
  }

  if (def.type === "radio") {
    return (
      <fieldset className="flex flex-col gap-1.5" aria-describedby={describedBy} disabled={disabled}>
        <legend className="text-sm font-medium text-text">
          {def.label}
          {def.required && <span className="ml-1 text-muted">(obrigatório)<span className="text-danger" aria-hidden="true"> *</span></span>}
        </legend>
        {description}
        <div className="flex flex-wrap gap-x-4 gap-y-1.5">
          {(def.options ?? []).map((o) => (
            <label key={o} className="inline-flex items-center gap-2 text-sm text-text">
              <input type="radio" name={id} className="h-4 w-4 accent-accent" checked={value === o} onChange={() => onChange(o)} />
              {o}
            </label>
          ))}
        </div>
        {footer}
      </fieldset>
    );
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-text">
        {def.label}
        {def.required && (
          <span className="ml-1 text-muted">
            (obrigatório)<span className="text-danger" aria-hidden="true"> *</span>
          </span>
        )}
      </label>
      {description}

      {def.type === "long_text" ? (
        <Textarea {...common} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      ) : def.type === "select" ? (
        <Select
          id={id}
          invalid={!!shownError}
          disabled={disabled}
          value={(value as string) ?? undefined}
          onValueChange={onChange}
          options={(def.options ?? []).map((o) => ({ value: o, label: o }))}
        />
      ) : def.type === "currency" || def.type === "number" ? (
        <Input
          {...common}
          type="number"
          inputMode="decimal"
          value={value === null || value === undefined ? "" : String(value)}
          onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        />
      ) : def.type === "date" || def.type === "due_date" ? (
        <Input {...common} type="date" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      ) : def.type === "datetime" ? (
        <Input {...common} type="datetime-local" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      ) : def.type === "email" ? (
        <Input {...common} type="email" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      ) : def.type === "phone" ? (
        <Input {...common} type="tel" inputMode="tel" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input {...common} type="text" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      )}

      {footer}
    </div>
  );
}
