import * as RSelect from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import { cn } from "../../lib/cn";

export interface SelectOption {
  value: string;
  label: string;
}

interface SelectProps {
  value?: string;
  onValueChange?: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  id?: string;
  invalid?: boolean;
  disabled?: boolean;
  "aria-label"?: string;
}

/** Accessible select built on Radix (listbox semantics, keyboard, type-ahead). */
export function Select({ value, onValueChange, options, placeholder = "Selecione…", id, invalid, disabled, "aria-label": ariaLabel }: SelectProps) {
  return (
    <RSelect.Root value={value} onValueChange={onValueChange} disabled={disabled}>
      <RSelect.Trigger
        id={id}
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        className={cn(
          "inline-flex h-10 w-full items-center justify-between rounded-md bg-bg px-3 text-sm text-text",
          "border border-border-input focus:border-accent disabled:opacity-60",
          invalid && "border-danger"
        )}
      >
        <RSelect.Value placeholder={placeholder} />
        <RSelect.Icon><ChevronDown className="h-4 w-4 text-muted" /></RSelect.Icon>
      </RSelect.Trigger>
      <RSelect.Portal>
        <RSelect.Content
          position="popper"
          sideOffset={4}
          className="z-50 overflow-hidden rounded-md border border-border bg-surface-raised shadow-pop"
        >
          <RSelect.Viewport className="p-1">
            {options.map((o) => (
              <RSelect.Item
                key={o.value}
                value={o.value}
                className={cn(
                  "relative flex h-9 cursor-pointer select-none items-center rounded-sm pl-8 pr-3 text-sm text-text",
                  "data-[highlighted]:bg-surface data-[highlighted]:outline-none"
                )}
              >
                <RSelect.ItemIndicator className="absolute left-2 inline-flex items-center">
                  <Check className="h-4 w-4 text-accent" />
                </RSelect.ItemIndicator>
                <RSelect.ItemText>{o.label}</RSelect.ItemText>
              </RSelect.Item>
            ))}
          </RSelect.Viewport>
        </RSelect.Content>
      </RSelect.Portal>
    </RSelect.Root>
  );
}
