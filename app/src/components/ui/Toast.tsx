import * as RToast from "@radix-ui/react-toast";
import { createContext, useContext, useState, type ReactNode } from "react";
import { cn } from "../../lib/cn";

type Variant = "info" | "success" | "error";
interface ToastItem { id: number; title: string; variant: Variant; }

const ToastCtx = createContext<(title: string, variant?: Variant) => void>(() => {});

/** useToast() -> push(title, variant). role=alert for errors, status otherwise. */
export function useToast() {
  return useContext(ToastCtx);
}

const accent: Record<Variant, string> = {
  info: "border-l-accent",
  success: "border-l-success",
  error: "border-l-danger",
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const push = (title: string, variant: Variant = "info") =>
    setItems((prev) => [...prev, { id: Date.now() + Math.random(), title, variant }]);

  return (
    <ToastCtx.Provider value={push}>
      <RToast.Provider swipeDirection="right">
        {children}
        {items.map((t) => (
          <RToast.Root
            key={t.id}
            type={t.variant === "error" ? "foreground" : "background"}
            onOpenChange={(open) => !open && setItems((prev) => prev.filter((x) => x.id !== t.id))}
            className={cn(
              "rounded-md border border-border border-l-4 bg-surface-raised p-3 text-sm text-text shadow-pop",
              accent[t.variant]
            )}
          >
            <RToast.Title>{t.title}</RToast.Title>
          </RToast.Root>
        ))}
        <RToast.Viewport className="fixed bottom-0 right-0 z-[60] flex w-96 max-w-[100vw] flex-col gap-2 p-4" />
      </RToast.Provider>
    </ToastCtx.Provider>
  );
}
