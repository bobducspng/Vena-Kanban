import { createTRPCClient, httpBatchLink, TRPCClientError, type TRPCLink } from "@trpc/client";
import { observable } from "@trpc/server/observable";
import superjson from "superjson";
// Type-only import of the server's router — erased at build, gives end-to-end types.
import type { AppRouter } from "../../../server/dist/trpc/routers/_app.js";

/** Base URL of the API ("/fluxos" behind nginx, "" same-origin, or the dev server). */
export const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

/** True when an error is a tRPC UNAUTHORIZED (no/expired session). */
export function isUnauthorized(err: unknown): boolean {
  return err instanceof TRPCClientError && err.data?.code === "UNAUTHORIZED";
}

/** True when an error is a tRPC CONFLICT (optimistic version lock lost). */
export function isConflict(err: unknown): boolean {
  return err instanceof TRPCClientError && err.data?.code === "CONFLICT";
}

/**
 * Changes of configuration (not of cards): after one succeeds, the app shows
 * "Configuração salva" (see ToastProvider). Card work already shows in the card's activity.
 */
const CONFIG = new RegExp("^(" + [
  "pipe\\.(create|update|clone|remove|restore)", "phase\\.(create|update|setTransitions|setAssignees|setStart|reorder|remove)",
  "field\\.(create|update|archive|reorder|remove)", "label\\.(create|update|remove)", "condition\\.(create|update|move|remove)",
  "automation\\.(create|update|setActive|duplicate|remove)", "email\\.(createTemplate|updateTemplate|removeTemplate)", "pdf\\.(create|update|remove)",
  "publicForm\\.(setPublished|update|regenerate)", "calendar\\.update", "bi\\.(regenerate|disable)", "letterhead\\.(create|update|setDefault|remove)",
  "people\\.(setOrgRole|remove|setPipeRole|saveGroup|removeGroup|setPipeGroupRole)", "org\\.(update|inboxSetEnabled|driveConnect|driveDisconnect)",
  "integration\\.(createToken|revokeToken|createWebhook|updateWebhook|removeWebhook)",
  "database\\.(create|update|remove|restore|createColumn|updateColumn|reorderColumns|archiveColumn|removeColumn|setAccess|setMember)",
].join("|") + ")$");
export const CONFIG_SAVED_EVENT = "venaflow:config-saved";

const configSavedLink: TRPCLink<AppRouter> = () => ({ next, op }) => observable((observer) =>
  next(op).subscribe({
    next(value) {
      if (op.type === "mutation" && CONFIG.test(op.path)) window.dispatchEvent(new CustomEvent(CONFIG_SAVED_EVENT, { detail: op.path }));
      observer.next(value);
    },
    error: (err) => observer.error(err),
    complete: () => observer.complete(),
  }));

export const trpc = createTRPCClient<AppRouter>({
  links: [
    configSavedLink,
    httpBatchLink({
      url: `${API_URL}/trpc`,
      transformer: superjson,
      // Send the session cookie on every request.
      fetch(url, options) {
        return fetch(url, { ...options, credentials: "include" });
      },
    }),
  ],
});
