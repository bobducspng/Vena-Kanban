import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Modal } from "../components/ui/Modal";

/** Atalhos de teclado (M11). Ignored while typing in a field. */
export const SHORTCUTS: [string, string][] = [
  ["?", "Mostrar esta lista"],
  ["/", "Ir para a busca da tela (lista do pipe, banco de dados)"],
  ["n", "Novo card (no quadro do pipe)"],
  ["1 · 2 · 3 · 4", "Num pipe: Quadro · Lista · Dashboard · Flow"],
  ["g p", "Ir para Pipes"],
  ["g t", "Ir para Meu trabalho"],
  ["g b", "Ir para Bancos de dados"],
  ["g a", "Ir para Automações"],
  ["g m", "Ir para o Mapa de processos"],
  ["g c", "Ir para Configurações"],
  ["Esc", "Fechar janela aberta"],
];
const GO: Record<string, string> = { p: "/", t: "/my-work", b: "/databases", a: "/automations", m: "/map", c: "/settings" };
const TABS = ["", "/list", "/dashboard", "/flow"];
/** The board listens for this to open "Novo card". */
export const NEW_CARD_EVENT = "venaflow:new-card";

const typing = (t: EventTarget | null) => {
  const el = t as HTMLElement | null;
  return !!el && (el.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(el.tagName) || el.getAttribute("role") === "combobox");
};

export function ShortcutsHelp() {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);
  const pendingG = useRef(0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typing(e.target)) return;
      // A dialog is open: leave the keys to it.
      if (document.querySelector("[role=dialog]") && e.key !== "?") return;
      const k = e.key;
      if (Date.now() - pendingG.current < 1200 && GO[k]) { e.preventDefault(); pendingG.current = 0; navigate(GO[k]); return; }
      if (k === "g") { pendingG.current = Date.now(); return; }
      if (k === "?") { e.preventDefault(); setOpen((o) => !o); return; }
      if (k === "/") {
        const el = document.querySelector<HTMLInputElement>("[data-shortcut=search]");
        if (el) { e.preventDefault(); el.focus(); el.select(); }
        return;
      }
      const pipe = /^\/pipes\/([^/]+)/.exec(pathname)?.[1];
      if (pipe && /^[1-4]$/.test(k)) { navigate(`/pipes/${pipe}${TABS[Number(k) - 1]}`); return; }
      if (k === "n" && pipe && /^\/pipes\/[^/]+\/?$/.test(pathname)) { e.preventDefault(); window.dispatchEvent(new Event(NEW_CARD_EVENT)); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, pathname]);

  return (
    <Modal open={open} onOpenChange={setOpen} title="Atalhos de teclado">
      <table className="w-full text-sm">
        <tbody>
          {SHORTCUTS.map(([keys, what]) => (
            <tr key={keys} className="border-b border-border last:border-0">
              <td className="py-1.5 pr-4"><kbd className="rounded border border-border-input bg-surface px-1.5 py-0.5 font-mono text-xs text-text">{keys}</kbd></td>
              <td className="py-1.5 text-text">{what}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Modal>
  );
}
