/** Frame of the pages people outside see (no login, no app chrome). */
export function PublicShell({ children, style, wide }: { children: React.ReactNode; style?: React.CSSProperties; wide?: boolean }) {
  return (
    <div className="min-h-screen bg-surface px-4 py-8" style={style}>
      <main className={`mx-auto rounded-lg bg-bg p-6 shadow-card ${wide ? "max-w-3xl" : "max-w-xl"}`}>{children}</main>
      <p className="mt-4 text-center text-xs text-muted">Enviado com Fluxos</p>
    </div>
  );
}

/** JSON over the public API; server errors become Error(message). */
export async function publicFetch<T>(url: string, init?: RequestInit): Promise<T> {
  const r = await fetch(url, init);
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error((d as { error?: string }).error ?? "Indisponível no momento.");
  return d as T;
}
