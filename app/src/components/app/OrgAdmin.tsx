import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { api } from "../../data/store";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { useToast } from "../ui/Toast";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado");

/** Configurações > Organização: the name shown on the portal, public forms and e-mails. */
export function OrgNameSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: org } = useQuery({ queryKey: ["org"], queryFn: api.org.get });
  const [name, setName] = useState("");
  useEffect(() => { if (org) setName(org.name); }, [org]);
  const save = useMutation({
    mutationFn: () => api.org.update(name.trim()),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["org"] }); toast("Nome salvo", "success"); },
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <section aria-label="Organização" className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div>
        <h3 className="text-sm font-semibold text-text">Organização</h3>
        <p className="text-xs text-muted">Aparece no topo do portal de solicitações.</p>
      </div>
      <form className="flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); if (name.trim()) save.mutate(); }}>
        <div className="min-w-48 flex-1"><Input aria-label="Nome da organização" value={name} maxLength={255} onChange={(e) => setName(e.target.value)} /></div>
        <Button type="submit" loading={save.isPending} disabled={!name.trim() || name.trim() === org?.name}>Salvar</Button>
      </form>
    </section>
  );
}

// "field.update" → "Campo · alterou". Unknown paths show as they are.
const AREA: Record<string, string> = {
  pipe: "Pipe", phase: "Fase", field: "Campo", label: "Etiqueta", condition: "Condicional", automation: "Automação",
  email: "E-mail", publicForm: "Formulário público", people: "Pessoas", org: "Organização", calendar: "Calendário",
  bi: "Power BI", database: "Database", card: "Cards", connection: "Conexão", outside: "Links externos",
};
const VERB: Record<string, string> = {
  create: "criou", update: "alterou", remove: "excluiu", restore: "restaurou", clone: "clonou", archive: "arquivou",
  reorder: "reordenou", setOrgRole: "mudou o papel", setPipeRole: "mudou membro do pipe", regenerate: "gerou nova chave",
  disable: "desligou", bulk: "ação em massa", setPublished: "publicou/despublicou", createTemplate: "criou template",
  updateTemplate: "alterou template", removeTemplate: "excluiu template", setTransitions: "alterou \"Mover para\"",
};
export function auditLabel(action: string) {
  const [area, ...rest] = action.split(".");
  const verb = rest.join(".");
  return `${AREA[area] ?? area} · ${VERB[verb] ?? verb}`;
}
const when = (d: Date | string) => new Date(d).toLocaleString("pt-BR");

/** Configurações > Auditoria: every configuration change made by an admin. */
export function AuditSettings() {
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: ["audit"],
    queryFn: ({ pageParam }) => api.org.audit(pageParam, 100),
    initialPageParam: undefined as Date | undefined,
    getNextPageParam: (last) => (last.length === 100 ? new Date(last[last.length - 1].createdAt) : undefined),
  });
  const rows = data?.pages.flat() ?? [];

  const exportCsv = async () => {
    setExporting(true);
    try {
      const all = await api.org.audit(undefined, 5000);
      const cell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
      const lines = [["Quando", "Quem", "E-mail", "Ação", "Código", "Dados"].map(cell).join(";"),
        ...all.map((r) => [when(r.createdAt), r.userName, r.userEmail, auditLabel(r.action), r.action, r.input].map(cell).join(";"))];
      const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
      const a = Object.assign(document.createElement("a"), { href: url, download: `auditoria-${new Date().toISOString().slice(0, 10)}.csv` });
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) { toast(errMsg(e), "error"); } finally { setExporting(false); }
  };

  return (
    <section aria-label="Auditoria" className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text">Auditoria</h3>
          <p className="text-xs text-muted">Toda alteração de configuração feita por administradores: quem, o quê e quando. O histórico de cada card fica no próprio card.</p>
        </div>
        <Button size="sm" variant="secondary" loading={exporting} onClick={exportCsv}><Download className="h-4 w-4" aria-hidden="true" /> Exportar CSV</Button>
      </div>
      {rows.length === 0 ? <p className="text-sm text-muted">Nenhuma alteração registrada ainda.</p> : (
        <ul className="flex max-h-96 flex-col divide-y divide-border overflow-y-auto rounded-md border border-border">
          {rows.map((r) => (
            <li key={r.id} className="px-3 py-1.5 text-sm">
              <details>
                <summary className="flex cursor-pointer flex-wrap gap-x-3">
                  <span className="w-36 shrink-0 text-muted">{when(r.createdAt)}</span>
                  <span className="text-text">{r.userName ?? r.userEmail ?? "—"}</span>
                  <span className="text-muted">{auditLabel(r.action)}</span>
                </summary>
                {r.input && <pre className="mt-1 whitespace-pre-wrap break-all rounded bg-surface p-2 text-xs text-muted">{r.input}</pre>}
              </details>
            </li>
          ))}
        </ul>
      )}
      {hasNextPage && <Button size="sm" variant="ghost" loading={isFetchingNextPage} onClick={() => fetchNextPage()}>Carregar mais</Button>}
    </section>
  );
}
