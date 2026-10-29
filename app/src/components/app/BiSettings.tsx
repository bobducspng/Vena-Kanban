import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy } from "lucide-react";
import { api } from "../../data/store";
import { Button } from "../ui/Button";
import { useToast } from "../ui/Toast";

/** Configurações > Power BI: secret read-only data links (Web connector). */
export function BiSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: feed } = useQuery({ queryKey: ["bi"], queryFn: api.bi.get });
  const { data: pipes } = useQuery({ queryKey: ["pipes"], queryFn: api.pipe.list });
  const done = () => qc.invalidateQueries({ queryKey: ["bi"] });
  const regen = useMutation({ mutationFn: api.bi.regenerate, onSuccess: () => { done(); toast("Chave gerada", "success"); } });
  const off = useMutation({ mutationFn: api.bi.disable, onSuccess: () => { done(); toast("Acesso do Power BI desligado", "success"); } });
  const copy = (u: string) => { void navigator.clipboard.writeText(u); toast("Link copiado", "success"); };

  return (
    <section aria-label="Power BI" className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text">Power BI</h3>
          <p className="text-xs text-muted">Links de leitura com chave secreta. Quem tiver o link lê os dados dos pipes — guarde como uma senha.</p>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant={feed ? "secondary" : "primary"} loading={regen.isPending}
            onClick={() => { if (!feed || confirm("Gerar uma chave nova? Os links atuais param de funcionar no Power BI.")) regen.mutate(); }}>
            {feed ? "Gerar nova chave" : "Ativar"}
          </Button>
          {feed && <Button size="sm" variant="ghost" onClick={() => { if (confirm("Desligar o acesso do Power BI?")) off.mutate(); }}>Desligar</Button>}
        </div>
      </div>
      {feed && (
        <>
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {(pipes ?? []).map((p) => (
              <li key={p.id} className="flex flex-col gap-1 px-3 py-2 text-sm">
                <span className="font-medium text-text">{p.icon && <span aria-hidden="true">{p.icon} </span>}{p.name}</span>
                {[["Cards (uma linha por card, um campo por coluna)", `${feed.url}/pipes/${p.id}/cards`], ["Tempo em cada fase", `${feed.url}/pipes/${p.id}/phase-history`]].map(([label, url]) => (
                  <div key={url} className="flex items-center gap-2 text-xs">
                    <span className="w-64 shrink-0 text-muted">{label}</span>
                    <code className="min-w-0 flex-1 truncate rounded bg-surface px-2 py-1 text-muted">{url}</code>
                    <button aria-label={`Copiar link: ${label}`} onClick={() => copy(url)} className="rounded p-1 text-muted hover:text-text"><Copy className="h-3.5 w-3.5" /></button>
                  </div>
                ))}
              </li>
            ))}
          </ul>
          <details className="text-xs text-muted">
            <summary className="cursor-pointer text-accent">Como ligar no Power BI</summary>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>Power BI Desktop → <strong>Obter dados</strong> → <strong>Web</strong>.</li>
              <li>Cole um dos links acima e confirme (acesso <strong>Anônimo</strong>).</li>
              <li>No Power Query: <strong>Converter em tabela</strong> → expandir a coluna (ícone de setas) → Fechar e aplicar.</li>
              <li>Para atualizar, use <strong>Atualizar</strong>; no Power BI Service, agende a atualização com a mesma fonte Web.</li>
            </ol>
            <p className="mt-2">Datas vêm em UTC (ISO); "minutos" já descontam noites, fins de semana e feriados quando o pipe usa horário útil.</p>
          </details>
        </>
      )}
    </section>
  );
}
