import { forwardRef, type TextareaHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { className, invalid, ...props },
  ref
) {
  return (
    <textarea
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "min-h-24 w-full resize-y rounded-md bg-bg px-3 py-2 text-sm text-text",
        "border border-border-input placeholder:text-muted",
        "focus:border-accent disabled:opacity-60",
        invalid && "border-danger",
        className
      )}
      {...props}
    />
  );
});
