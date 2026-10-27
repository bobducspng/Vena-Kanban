import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../data/store";
import { isUnauthorized } from "../../lib/trpc";
import { Spinner } from "../ui/Spinner";

/** Gates protected routes (BUG-001). Checks the session via `user.me`:
 *  - no/expired session (UNAUTHORIZED) → redirect to /login
 *  - still checking → spinner
 *  - other error → a plain message (no redirect loop)
 *  On success the current user is already cached under ["me"]. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { data, isLoading, error } = useQuery({
    queryKey: ["me"],
    queryFn: api.user.me,
    retry: (count, err) => !isUnauthorized(err) && count < 2,
    staleTime: 60_000,
  });

  if (isUnauthorized(error)) return <Navigate to="/login" replace />;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface">
        <Spinner className="h-5 w-5 text-muted" label="Verificando sessão" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-surface p-4">
        <div className="max-w-sm text-center">
          <p className="text-sm font-medium text-text">Não foi possível carregar sua sessão.</p>
          <p className="mt-1 text-sm text-muted">Verifique sua conexão e tente novamente.</p>
        </div>
      </div>
    );
  }

  // Logged in (data may be null only if the user row vanished mid-session).
  if (!data) return <Navigate to="/login" replace />;

  return <>{children}</>;
}
