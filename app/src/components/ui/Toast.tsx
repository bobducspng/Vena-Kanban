import * as RToast from "@radix-ui/react-toast";
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { CONFIG_SAVED_EVENT } from "../../lib/trpc";
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
  const lastPush = useRef(0);
  const push = (title: string, variant: Variant = "info") => {
    lastPush.current = Date.now();
    setItems((prev) => [...prev, { id: Date.now() + Math.random(), title, variant }]);
  };

  // "Configuração salva" after a configuration change, unless the screen already said
  // something about it (its own message comes right after) or one is still on screen.
  useEffect(() => {
    const onSaved = () => {
      const at = Date.now();
      setTimeout(() => {
        if (lastPush.current >= at) return;
        setItems((prev) => (prev.some((t) => t.title === "Configuração salva")
          ? prev
          : [...prev, { id: Date.now() + Math.random(), title: "Configuração salva", variant: "success" }]));
      }, 400);
    };
    window.addEventListener(CONFIG_SAVED_EVENT, onSaved);
    return () => window.removeEventListener(CONFIG_SAVED_EVENT, onSaved);
  }, []);

  return (
    <ToastCtx.Provider value={push}>
      <RToast.Provider swipeDirection="right" duration={3000}>
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
        <RToast.Viewport className="fixed right-0 top-0 z-[60] flex w-96 max-w-[100vw] flex-col gap-2 p-4" />
      </RToast.Provider>
    </ToastCtx.Provider>
  );
}
