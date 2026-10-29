import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FileText, Pencil, Plus, Trash2 } from "lucide-react";
import { api, type PdfTemplateInput } from "../../data/store";
import type { FieldDef } from "../../data/types";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Modal } from "../ui/Modal";
import { Textarea } from "../ui/Textarea";
import { useToast } from "../ui/Toast";
import { Placeholders } from "./EmailParts";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado");
type PdfTemplate = { id: string; pipeId: string } & PdfTemplateInput;

/** Configurar pipe > Modelos de PDF. */
export function PdfTemplatesSection({ pipeId, fields }: { pipeId: string; fields: FieldDef[] }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [editing, setEditing] = useState<PdfTemplate | "new" | null>(null);
  const { data: templates } = useQuery({ queryKey: ["pdfTemplates", pipeId], queryFn: () => api.pdf.templates(pipeId) });
  const remove = useMutation({
    mutationFn: api.pdf.remove,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pdfTemplates", pipeId] }),
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <section aria-label="Modelos de PDF" className="flex flex-col gap-3 rounded-lg border border-border bg-bg p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text">Modelos de PDF</h3>
          <p className="text-xs text-muted">Documentos com os dados do card (proposta, ordem de compra, contrato). Gerados pelo card ("Anexos → Gerar PDF") ou por automação; o PDF fica anexado ao card.</p>
        </div>
        <Button size="sm" onClick={() => setEditing("new")}><Plus className="h-4 w-4" aria-hidden="true" /> Novo modelo</Button>
      </div>
      {templates?.length ? (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {templates.map((t) => (
            <li key={t.id} className="flex items-center gap-2 px-3 py-2">
              <FileText className="h-4 w-4 text-muted" aria-hidden="true" />
              <p className="min-w-0 flex-1 truncate text-sm text-text">{t.name}</p>
              <button aria-label={`Editar ${t.name}`} onClick={() => setEditing(t)} className="rounded p-1 text-muted hover:bg-surface"><Pencil className="h-4 w-4" /></button>
              <button aria-label={`Excluir ${t.name}`} onClick={() => { if (confirm(`Excluir o modelo "${t.name}"?`)) remove.mutate(t.id); }} className="rounded p-1 text-muted hover:bg-surface hover:text-danger"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted">Nenhum modelo ainda. Sem modelo, o card gera um "Resumo do card" com todos os campos preenchidos.</p>}
      <PdfTemplateModal pipeId={pipeId} fields={fields} editing={editing} onClose={() => setEditing(null)} />
    </section>
  );
}

function PdfTemplateModal({ pipeId, fields, editing, onClose }: { pipeId: string; fields: FieldDef[]; editing: PdfTemplate | "new" | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const existing = editing && editing !== "new" ? editing : null;
  const [t, setT] = useState<PdfTemplateInput>({ name: "", body: "", useDefaultLayout: true, showLogo: true, header: null, footer: null });
  const { name, body } = t;
  const setName = (v: string) => setT((x) => ({ ...x, name: v }));
  const setBody = (f: string | ((b: string) => string)) => setT((x) => ({ ...x, body: typeof f === "function" ? f(x.body) : f }));
  useEffect(() => {
    if (!editing) return;
    setT({ name: existing?.name ?? "", body: "", useDefaultLayout: existing?.useDefaultLayout ?? true, showLogo: existing?.showLogo ?? true, header: existing?.header ?? null, footer: existing?.footer ?? null });
    setBody(existing?.body ?? "# Pedido #{#}: {Título}\n\n**Fase:** {Fase}\n\n## Dados\n{Todos os campos}\n\n---\nAprovado por: ______________________   Data: ____/____/______");
  }, [editing]); // eslint-disable-line react-hooks/exhaustive-deps
  const save = useMutation({
    mutationFn: async (): Promise<unknown> => (existing ? api.pdf.update({ templateId: existing.id, ...t }) : api.pdf.create({ pipeId, ...t })),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pdfTemplates", pipeId] }); toast("Modelo salvo", "success"); onClose(); },
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <Modal open={!!editing} onOpenChange={(o) => !o && onClose()} title={existing ? "Editar modelo de PDF" : "Novo modelo de PDF"} size="wide"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button onClick={() => save.mutate()} loading={save.isPending} disabled={!name.trim() || !body.trim()}>Salvar</Button></>}>
      <div className="flex flex-col gap-3">
        <Input aria-label="Nome do modelo" placeholder="Nome (ex.: Ordem de compra)" value={name} onChange={(e) => setName(e.target.value)} />
        <Textarea aria-label="Conteúdo do PDF" rows={14} className="font-mono text-xs" value={body} onChange={(e) => setBody(e.target.value)} />
        <div className="rounded-md bg-surface p-2 text-xs text-muted">
          <p className="font-medium text-text">Como escrever</p>
          <ul className="mt-1 grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
            <li><code># Texto</code> título grande · <code>## Texto</code> subtítulo</li>
            <li><code>- item</code> lista · <code>---</code> linha divisória</li>
            <li><code>**texto**</code> negrito · linha em branco separa parágrafos</li>
            <li><code>{"{Todos os campos}"}</code> tabela com tudo que foi preenchido</li>
          </ul>
        </div>
        <fieldset className="flex flex-col gap-2 rounded-md border border-border p-3">
          <legend className="px-1 text-sm font-medium text-text">Logo, cabeçalho e rodapé</legend>
          <label className="inline-flex items-center gap-2 text-sm text-text">
            <input type="checkbox" className="h-4 w-4 accent-accent" checked={t.useDefaultLayout} onChange={(e) => setT({ ...t, useDefaultLayout: e.target.checked })} />
            Usar o papel timbrado padrão (Configurações → Papel timbrado dos PDFs)
          </label>
          {!t.useDefaultLayout && (
            <>
              <label className="inline-flex items-center gap-2 text-sm text-text">
                <input type="checkbox" className="h-4 w-4 accent-accent" checked={t.showLogo} onChange={(e) => setT({ ...t, showLogo: e.target.checked })} />
                Mostrar o logo da empresa
              </label>
              <Textarea aria-label="Cabeçalho deste modelo" rows={3} placeholder="Cabeçalho deste modelo (vazio = sem cabeçalho)" value={t.header ?? ""} onChange={(e) => setT({ ...t, header: e.target.value || null })} />
              <Textarea aria-label="Rodapé deste modelo" rows={2} placeholder="Rodapé deste modelo (vazio = rodapé simples com data e página)" value={t.footer ?? ""} onChange={(e) => setT({ ...t, footer: e.target.value || null })} />
            </>
          )}
          {existing && <a href={api.org.previewUrl(existing.id)} target="_blank" rel="noreferrer" className="self-start text-xs text-accent hover:underline">Ver exemplo (como está salvo)</a>}
        </fieldset>
        <p className="text-xs text-muted">Clique para inserir um dado do card:</p>
        <Placeholders fields={fields} onPick={(p) => setBody((b) => `${b}${p}`)} />
      </div>
    </Modal>
  );
}

/** Card > Anexos > "Gerar PDF": pick a modelo (or the summary); the file joins the attachments. */
export function GeneratePdfButton({ cardId, pipeId, onDone }: { cardId: string; pipeId: string; onDone: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState<string>("");
  const { data: templates } = useQuery({ queryKey: ["pdfTemplates", pipeId], queryFn: () => api.pdf.templates(pipeId), enabled: open });
  const gen = useMutation({
    mutationFn: () => api.pdf.generate(cardId, choice || null),
    onSuccess: (f) => { onDone(); setOpen(false); toast(`"${f?.filename}" gerado e anexado ao card`, "success"); },
    onError: (e) => toast(errMsg(e), "error"),
  });
  return (
    <>
      <Button size="sm" variant="ghost" onClick={() => { setChoice(""); setOpen(true); }}><FileText className="h-4 w-4" aria-hidden="true" /> Gerar PDF</Button>
      <Modal open={open} onOpenChange={setOpen} title="Gerar PDF"
        footer={<><Button variant="secondary" onClick={() => setOpen(false)}>Cancelar</Button><Button onClick={() => gen.mutate()} loading={gen.isPending}>Gerar</Button></>}>
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-sm text-muted">Qual documento?</legend>
          {[{ id: "", name: "Resumo do card (todos os campos)" }, ...(templates ?? [])].map((t) => (
            <label key={t.id || "default"} className="inline-flex items-center gap-2 text-sm text-text">
              <input type="radio" name="pdf-template" className="h-4 w-4 accent-accent" checked={choice === t.id} onChange={() => setChoice(t.id)} />
              {t.name}
            </label>
          ))}
        </fieldset>
      </Modal>
    </>
  );
}
