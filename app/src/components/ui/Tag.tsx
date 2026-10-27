import { cn } from "../../lib/cn";

const dot: Record<string, string> = {
  gray: "bg-label-gray", red: "bg-label-red", orange: "bg-label-orange",
  amber: "bg-label-amber", green: "bg-label-green", teal: "bg-label-teal",
  blue: "bg-label-blue", purple: "bg-label-purple", pink: "bg-label-pink",
};

/** Label/phase pill. Colour is never the only signal — the text always shows. */
export function Tag({ children, color = "gray" }: { children: React.ReactNode; color?: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-pill border border-border bg-surface px-2 py-0.5 text-xs font-medium text-text">
      <span className={cn("h-2 w-2 rounded-pill", dot[color] ?? dot.gray)} aria-hidden="true" />
      {children}
    </span>
  );
}
