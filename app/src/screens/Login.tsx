import { useSearchParams } from "react-router-dom";
import { Button } from "../components/ui/Button";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:4000";

/** S01 — sign in. Redirects to the backend's Google OAuth flow; on success the
 *  server sets the session cookie and redirects back to the app (APP_ORIGIN). */
export function Login() {
  const [params] = useSearchParams();
  const unauthorized = params.get("error") === "nao_autorizado";
  return (
    <div className="flex min-h-screen items-center justify-center bg-surface p-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-bg p-8 shadow-card">
        <h1 className="text-xl text-text">Fluxos</h1>
        <p className="mt-2 text-sm text-muted">
          Organize seus processos em quadros, do pedido à conclusão.
        </p>
        {unauthorized && (
          <p className="mt-4 rounded-md border border-danger bg-surface px-3 py-2 text-sm text-danger" role="alert">
            Esta conta não tem acesso. Use um e-mail autorizado da organização.
          </p>
        )}
        <Button className="mt-6 w-full" onClick={() => { window.location.href = `${API_URL}/auth/google`; }}>
          Entrar com Google
        </Button>
        <p className="mt-4 text-xs text-muted">
          Você será redirecionado para o Google e voltará autenticado.
        </p>
      </div>
    </div>
  );
}
