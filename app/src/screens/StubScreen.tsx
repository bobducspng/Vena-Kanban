import { Construction } from "lucide-react";
import { AppShell } from "../components/app/AppShell";

/** Placeholder for screens not yet built in this milestone. Honest, not fake:
 *  it names the screen and what it will hold, so nothing looks done that isn't. */
export function StubScreen({ id, title, planned }: { id: string; title: string; planned: string[] }) {
  return (
    <AppShell title={title}>
      <div className="mx-auto max-w-content p-6">
        <div className="rounded-lg border border-dashed border-border-input p-12 text-center">
          <Construction className="mx-auto h-8 w-8 text-muted" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-text">
            {id} · {title}
          </p>
          <p className="mt-1 text-sm text-muted">Tela planejada, ainda não construída nesta etapa.</p>
          {planned.length > 0 && (
            <ul className="mx-auto mt-4 max-w-sm list-inside list-disc text-left text-sm text-muted">
              {planned.map((p) => <li key={p}>{p}</li>)}
            </ul>
          )}
        </div>
      </div>
    </AppShell>
  );
}
