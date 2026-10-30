import { useEffect } from "react";
import { useIsMutating } from "@tanstack/react-query";

/** While something is still being saved, closing or reloading the tab asks first. Renders nothing. */
export function SaveIndicator() {
  const pending = useIsMutating();
  useEffect(() => {
    if (!pending) return;
    const warn = (ev: BeforeUnloadEvent) => { ev.preventDefault(); ev.returnValue = ""; };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [pending]);
  return null;
}
