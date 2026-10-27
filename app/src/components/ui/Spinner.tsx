import { cn } from "../../lib/cn";

/** Accessible spinner. Decorative by default; set `label` to announce it. */
export function Spinner({ className, label }: { className?: string; label?: string }) {
  return (
    <span
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn("inline-block animate-spin rounded-pill border-2 border-current border-t-transparent", className)}
    />
  );
}
