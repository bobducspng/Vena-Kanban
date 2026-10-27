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
}

/** Renders one field by its type, with a label, required marker and error.
 *  Required is signalled with text + aria-required, never colour alone. */
export function Field({ def, value, onChange, error }: FieldProps) {
  const id = useId();
  const errId = `${id}-err`;
  const common = {
    id,
    invalid: !!error,
    "aria-required": def.required || undefined,
    "aria-describedby": error ? errId : undefined,
  };

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

      {def.type === "long_text" ? (
        <Textarea {...common} value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      ) : def.type === "select" || def.type === "radio" ? (
        <Select
          id={id}
          invalid={!!error}
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
      ) : def.type === "email" ? (
        <Input {...common} type="email" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <Input {...common} type="text" value={(value as string) ?? ""} onChange={(e) => onChange(e.target.value)} />
      )}

      {error && (
        <p id={errId} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
