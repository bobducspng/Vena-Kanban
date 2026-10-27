import { forwardRef, type InputHTMLAttributes } from "react";
import { cn } from "../../lib/cn";

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, invalid, ...props },
  ref
) {
  return (
    <input
      ref={ref}
      aria-invalid={invalid || undefined}
      className={cn(
        "h-10 w-full rounded-md bg-bg px-3 text-sm text-text",
        "border border-border-input placeholder:text-muted",
        "focus:border-accent disabled:opacity-60",
        invalid && "border-danger",
        className
      )}
      {...props}
    />
  );
});
