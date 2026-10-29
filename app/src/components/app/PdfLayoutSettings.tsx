import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../../data/store";
import { Button } from "../ui/Button";
import { Textarea } from "../ui/Textarea";
import { useToast } from "../ui/Toast";

const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado");

/** Configurações > Papel timbrado dos PDFs: logo, cabeçalho e rodapé used by every modelo
 *  (unless a modelo has its own). Texts accept {campos} of the card and {Data de hoje}. */
export function PdfLayoutSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: org } = useQuery({ queryKey: ["org"], queryFn: api.org.get });
  const [header, setHeader] = useState("");
  const [footer, setFooter] = useState("");
  const [logoKey, setLogoKey] = useState(0);
  useEffect(() => { if (org) { setHeader(org.pdfHeader ?? ""); setFooter(org.pdfFooter ?? ""); } }, [org]);
  const refresh = () => { qc.invalidateQueries({ queryKey: ["org"] }); setLogoKey((k) => k + 1); };
  const save = useMutation({
    mutationFn: () => api.org.updatePdfLayout(header, footer),
    onSuccess: () => { refresh(); toast("Papel timbrado salvo", "success"); },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const upload = useMutation({
    mutationFn: api.org.uploadLogo,
    onSuccess: () => { refresh(); toast("Logo enviado", "success"); },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const removeLogo = useMutation({ mutationFn: api.org.removeLogo, onSuccess: refresh, onError: (e) => toast(errMsg(e), "error") });
  const dirty = header !== (org?.pdfHeader ?? "") || footer !== (org?.pdfFooter ?? "");

  return (
    <section aria-label="Papel timbrado dos PDFs" className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text">Papel timbrado dos PDFs</h3>
          <p className="text-xs text-muted">Logo, cabeçalho e rodapé de todos os PDFs gerados pelos cards. Um modelo de PDF pode usar o seu próprio (em Configurar pipe → Modelos de PDF).</p>
        </div>
        <a href={api.org.previewUrl()} target="_blank" rel="noreferrer" className="text-sm text-accent hover:underline">Ver exemplo</a>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-16 w-48 items-center justify-center rounded-md border border-dashed border-border-input bg-surface">
          {org?.hasLogo ? <img key={logoKey} src={api.org.logoUrl()} alt="Logo atual" className="max-h-14 max-w-44 object-contain" /> : <span className="text-xs text-muted">Sem logo</span>}
        </div>
        <label className="cursor-pointer text-sm text-accent hover:underline">
          {org?.hasLogo ? "Trocar logo" : "Enviar logo"}
          <input type="file" accept="image/png,image/jpeg" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload.mutate(f); }} />
        </label>
        {org?.hasLogo && <button className="text-sm text-danger" onClick={() => { if (confirm("Tirar o logo dos PDFs?")) removeLogo.mutate(); }}>Remover</button>}
        <span className="text-xs text-muted">PNG ou JPG, até 2 MB. Fica à esquerda do cabeçalho.</span>
      </div>
      <label className="flex flex-col gap-1 text-sm text-text">
        <span>Cabeçalho <span className="text-xs text-muted">(à direita do logo; até 4 linhas)</span></span>
        <Textarea rows={3} value={header} onChange={(e) => setHeader(e.target.value)}
          placeholder={"Vena Comércio Ltda · CNPJ 00.000.000/0001-00\nRua Exemplo, 100 · São Paulo/SP\nPedido {#} · {Data de hoje}"} />
      </label>
      <label className="flex flex-col gap-1 text-sm text-text">
        <span>Rodapé <span className="text-xs text-muted">(até 2 linhas; o número da página entra sozinho)</span></span>
        <Textarea rows={2} value={footer} onChange={(e) => setFooter(e.target.value)} placeholder="Documento interno · comunicacao@vena.app.br" />
      </label>
      <p className="text-xs text-muted">
        Pode usar dados do card: {"{Título}"}, {"{#}"}, {"{Fase}"}, {"{Pipe}"}, {"{Nome do campo}"} e {"{Data de hoje}"}.
        Sem logo e sem cabeçalho, o PDF mostra só o nome da organização. Salve antes de "Ver exemplo".
      </p>
      <div className="flex justify-end">
        <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty}>Salvar</Button>
      </div>
    </section>
  );
}
