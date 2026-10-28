import { createTRPCClient, httpBatchLink, TRPCClientError } from "@trpc/client";
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

export const trpc = createTRPCClient<AppRouter>({
  links: [
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
