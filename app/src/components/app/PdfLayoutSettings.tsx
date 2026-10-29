import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Star, Trash2 } from "lucide-react";
import { api } from "../../data/store";
import { Button } from "../ui/Button";
import { Input } from "../ui/Input";
import { Textarea } from "../ui/Textarea";
import { useToast } from "../ui/Toast";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado");
type Frente = Awaited<ReturnType<typeof api.letterhead.list>>[number];

/** Configurações > Papéis timbrados (frentes): one logo + cabeçalho + rodapé per frente
 *  da empresa. Each pipe picks its frente; one is the default. */
export function LetterheadsSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: list } = useQuery({ queryKey: ["letterheads"], queryFn: api.letterhead.list });
  const create = useMutation({
    mutationFn: () => {
      const name = prompt("Nome da frente (ex.: Vena Food):")?.trim();
      if (!name) throw new Error("");
      return api.letterhead.create({ name, header: "", footer: "" });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["letterheads"] }),
    onError: (e) => { if (errMsg(e)) toast(errMsg(e), "error"); },
  });

  return (
    <section aria-label="Papéis timbrados" className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text">Papéis timbrados (frentes)</h3>
          <p className="text-xs text-muted">
            Logo, cabeçalho e rodapé dos PDFs, um por frente da empresa. Cada pipe escolhe a sua frente (Configurar pipe); a marcada com ★ vale para os pipes que não escolheram.
            Um modelo de PDF também pode usar a frente escolhida num campo do card.
          </p>
        </div>
        <Button size="sm" onClick={() => create.mutate()} loading={create.isPending}><Plus className="h-4 w-4" aria-hidden="true" /> Nova frente</Button>
      </div>
      {!list?.length ? <p className="text-sm text-muted">Nenhuma frente ainda. Sem frente, o PDF mostra só o nome da organização no topo.</p> : (
        <ul className="flex flex-col gap-3">
          {list.map((f) => <FrenteEditor key={f.id} frente={f} />)}
        </ul>
      )}
      <p className="text-xs text-muted">Cabeçalho e rodapé aceitam dados do card: {"{Título}"}, {"{#}"}, {"{Fase}"}, {"{Pipe}"}, {"{Nome do campo}"} e {"{Data de hoje}"}.</p>
    </section>
  );
}

function FrenteEditor({ frente: f }: { frente: Frente }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState(f.name);
  const [header, setHeader] = useState(f.header ?? "");
  const [footer, setFooter] = useState(f.footer ?? "");
  const [logoVersion, setLogoVersion] = useState(0);
  useEffect(() => { setName(f.name); setHeader(f.header ?? ""); setFooter(f.footer ?? ""); }, [f]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["letterheads"] }); setLogoVersion((v) => v + 1); };
  const onError = (e: unknown) => toast(errMsg(e), "error");
  const save = useMutation({ mutationFn: () => api.letterhead.update({ id: f.id, name: name.trim(), header, footer }), onSuccess: () => { refresh(); toast("Frente salva", "success"); }, onError });
  const upload = useMutation({ mutationFn: (file: File) => api.letterhead.uploadLogo(f.id, file), onSuccess: () => { refresh(); toast("Logo enviado", "success"); }, onError });
  const removeLogo = useMutation({ mutationFn: () => api.letterhead.removeLogo(f.id), onSuccess: refresh, onError });
  const setDefault = useMutation({ mutationFn: () => api.letterhead.setDefault(f.id), onSuccess: refresh, onError });
  const remove = useMutation({ mutationFn: () => api.letterhead.remove(f.id), onSuccess: refresh, onError });
  const dirty = name.trim() !== f.name || header !== (f.header ?? "") || footer !== (f.footer ?? "");

  return (
    <li className="flex flex-col gap-3 rounded-md border border-border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-48 flex-1"><Input aria-label="Nome da frente" value={name} maxLength={120} onChange={(e) => setName(e.target.value)} /></div>
        {f.isDefault ? (
          <span className="inline-flex items-center gap-1 text-xs text-text"><Star className="h-4 w-4 fill-current text-warning" aria-hidden="true" /> Padrão</span>
        ) : (
          <button className="inline-flex items-center gap-1 text-xs text-accent" onClick={() => setDefault.mutate()}><Star className="h-4 w-4" aria-hidden="true" /> Tornar padrão</button>
        )}
        <a href={api.letterhead.previewUrl({ letterheadId: f.id })} target="_blank" rel="noreferrer" className="text-xs text-accent hover:underline">Ver exemplo</a>
        <button aria-label={`Excluir ${f.name}`} className="rounded p-1 text-muted hover:text-danger"
          onClick={() => { if (confirm(`Excluir a frente "${f.name}"? Pipes e modelos que a usam passam para o padrão.`)) remove.mutate(); }}>
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-16 w-48 items-center justify-center rounded-md border border-dashed border-border-input bg-surface">
          {f.hasLogo ? <img src={api.letterhead.logoUrl(f.id, logoVersion)} alt={`Logo ${f.name}`} className="max-h-14 max-w-44 object-contain" /> : <span className="text-xs text-muted">Sem logo</span>}
        </div>
        <label className="cursor-pointer text-sm text-accent hover:underline">
          {f.hasLogo ? "Trocar logo" : "Enviar logo"}
          <input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const file = e.target.files?.[0]; e.target.value = ""; if (file) upload.mutate(file); }} />
        </label>
        {f.hasLogo && <button className="text-sm text-danger" onClick={() => removeLogo.mutate()}>Remover logo</button>}
        <span className="text-xs text-muted">PNG ou JPG, até 2 MB.</span>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-sm text-text">
          <span>Cabeçalho <span className="text-xs text-muted">(à direita do logo; até 4 linhas)</span></span>
          <Textarea rows={3} value={header} onChange={(e) => setHeader(e.target.value)} placeholder={"Razão social · CNPJ\nEndereço\nPedido {#} · {Data de hoje}"} />
        </label>
        <label className="flex flex-col gap-1 text-sm text-text">
          <span>Rodapé <span className="text-xs text-muted">(até 2 linhas; a página entra sozinha)</span></span>
          <Textarea rows={3} value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="Site · telefone · e-mail" />
        </label>
      </div>
      {dirty && (
        <div className="flex justify-end gap-2">
          <Button size="sm" variant="secondary" onClick={() => { setName(f.name); setHeader(f.header ?? ""); setFooter(f.footer ?? ""); }}>Descartar</Button>
          <Button size="sm" onClick={() => save.mutate()} loading={save.isPending} disabled={!name.trim()}>Salvar</Button>
        </div>
      )}
    </li>
  );
}
