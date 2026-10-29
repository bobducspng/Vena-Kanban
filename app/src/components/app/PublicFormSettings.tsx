import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Copy, ExternalLink, RefreshCw } from "lucide-react";
import { api } from "../../data/store";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Select } from "../ui/Select";
import { Textarea } from "../ui/Textarea";
import { useToast } from "../ui/Toast";

type Branding = { description: string; color: string; buttonText: string; confirmMessage: string; allowMultiple: boolean; askEmail: "no" | "optional" | "required"; showInPortal: boolean };

/** Formulário público of a pipe: publish, link/embed, look and texts. */
export function PublicFormSettings({ pipeId }: { pipeId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const { data } = useQuery({ queryKey: ["publicForm", pipeId], queryFn: () => api.publicForm.get(pipeId) });
  const f = data?.form;
  const [title, setTitle] = useState("");
  const [b, setB] = useState<Branding | null>(null);
  useEffect(() => { if (f) { setTitle(f.title ?? ""); setB(f.branding as Branding); } }, [f?.id, f?.slug]); // eslint-disable-line react-hooks/exhaustive-deps

  const done = () => qc.invalidateQueries({ queryKey: ["publicForm", pipeId] });
  const onError = (e: unknown) => toast(e instanceof Error ? e.message : "Algo deu errado", "error");
  const publish = useMutation({ mutationFn: (p: boolean) => api.publicForm.setPublished(pipeId, p), onSuccess: done, onError });
  const update = useMutation({ mutationFn: api.publicForm.update, onSuccess: done, onError });
  const regen = useMutation({ mutationFn: () => api.publicForm.regenerate(pipeId), onSuccess: () => { done(); toast("Link novo gerado; o antigo parou de funcionar", "success"); }, onError });

  const published = !!f?.isPublic;
  const copy = (text: string, what: string) => { void navigator.clipboard.writeText(text); toast(`${what} copiado`, "success"); };
  const saveBranding = (patch: Partial<Branding>) => { if (!b) return; const next = { ...b, ...patch }; setB(next); update.mutate({ pipeId, branding: patch }); };
  const embed = f ? `<iframe src="${f.url}" style="width:100%;min-height:720px;border:0" title="${(f.title || "Formulário").replace(/"/g, "")}"></iframe>` : "";

  return (
    <section aria-label="Formulário público" className="flex flex-col gap-4 rounded-lg border border-border bg-bg p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text">Formulário público</h3>
          <p className="text-xs text-muted">O formulário inicial aberto por link, sem login. Cada envio vira um card na fase inicial.</p>
        </div>
        <label className="inline-flex items-center gap-2 text-sm text-text">
          <input type="checkbox" className="h-4 w-4 accent-accent" checked={published} disabled={publish.isPending} onChange={(e) => publish.mutate(e.target.checked)} />
          Publicado
        </label>
      </div>

      {!!data?.hiddenFields.length && (
        <p className="rounded-md border border-border bg-surface p-2 text-xs text-muted">
          Não aparecem no público (a equipe completa depois): {data.hiddenFields.map((h) => `${h.label}${h.required ? " (obrigatório)" : ""}`).join(", ")}.
        </p>
      )}

      {published && f && b && (
        <>
          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text">Link</span>
            <div className="flex gap-2">
              <Input readOnly value={f.url} aria-label="Link do formulário" className="font-mono text-xs" onFocus={(e) => e.currentTarget.select()} />
              <Button variant="secondary" aria-label="Copiar link" onClick={() => copy(f.url, "Link")}><Copy className="h-4 w-4" aria-hidden="true" /></Button>
              <a href={f.url} target="_blank" rel="noreferrer" aria-label="Abrir formulário" className="inline-flex h-10 items-center rounded-md border border-border px-3 text-muted hover:text-text"><ExternalLink className="h-4 w-4" /></a>
            </div>
            <div className="flex flex-wrap gap-3 text-xs">
              <button className="text-accent" onClick={() => copy(embed, "Código para incorporar")}>Copiar código para incorporar em um site</button>
              <button className="inline-flex items-center gap-1 text-muted hover:text-danger" onClick={() => { if (confirm("Gerar um link novo? O atual deixa de funcionar.")) regen.mutate(); }}>
                <RefreshCw className="h-3 w-3" aria-hidden="true" /> Gerar link novo
              </button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pf-title" className="text-sm font-medium text-text">Título</label>
              <Input id="pf-title" value={title} placeholder="(nome do pipe)" onChange={(e) => setTitle(e.target.value)} onBlur={() => update.mutate({ pipeId, title: title.trim() || null })} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pf-color" className="text-sm font-medium text-text">Cor</label>
              <div className="flex gap-2">
                <input id="pf-color" type="color" value={b.color} onChange={(e) => saveBranding({ color: e.target.value })} className="h-10 w-14 cursor-pointer rounded-md border border-border-input bg-bg" />
                <Input aria-label="Texto do botão" value={b.buttonText} onChange={(e) => setB({ ...b, buttonText: e.target.value })} onBlur={() => saveBranding({ buttonText: b.buttonText.trim() || "Enviar" })} />
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pf-desc" className="text-sm font-medium text-text">Descrição (aparece abaixo do título)</label>
            <Textarea id="pf-desc" rows={3} value={b.description} onChange={(e) => setB({ ...b, description: e.target.value })} onBlur={() => saveBranding({ description: b.description })} />
          </div>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="pf-confirm" className="text-sm font-medium text-text">Mensagem depois do envio</label>
            <Textarea id="pf-confirm" rows={2} value={b.confirmMessage} onChange={(e) => setB({ ...b, confirmMessage: e.target.value })} onBlur={() => saveBranding({ confirmMessage: b.confirmMessage })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pf-email" className="text-sm font-medium text-text">E-mail de quem envia</label>
              <Select id="pf-email" value={b.askEmail} onValueChange={(v) => saveBranding({ askEmail: v as Branding["askEmail"] })}
                options={[{ value: "no", label: "Não pedir" }, { value: "optional", label: "Pedir (opcional)" }, { value: "required", label: "Pedir (obrigatório)" }]} />
              {!data?.mailEnabled && b.askEmail !== "no" && <p className="text-xs text-warning">O envio de e-mail ainda não está configurado na VM: o e-mail fica guardado, mas a confirmação não sai.</p>}
            </div>
            <div className="flex flex-col gap-2 pt-7">
              <label className="inline-flex items-center gap-2 text-sm text-text">
                <input type="checkbox" className="h-4 w-4 accent-accent" checked={b.allowMultiple} onChange={(e) => saveBranding({ allowMultiple: e.target.checked })} />
                Permitir "enviar outra resposta"
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-text">
                <input type="checkbox" className="h-4 w-4 accent-accent" checked={f.closed} onChange={(e) => update.mutate({ pipeId, closed: e.target.checked })} />
                Fechado (link no ar, mas não recebe respostas)
              </label>
              <label className="inline-flex items-center gap-2 text-sm text-text">
                <input type="checkbox" className="h-4 w-4 accent-accent" checked={!!b.showInPortal} onChange={(e) => saveBranding({ showInPortal: e.target.checked })} />
                Mostrar no portal (<a href={`${import.meta.env.BASE_URL}portal`} target="_blank" rel="noreferrer" className="text-accent">abrir portal</a>)
              </label>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
