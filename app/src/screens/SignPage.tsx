import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { CheckCircle2, Clock, FileText } from "lucide-react";
import { API_URL } from "../lib/trpc";
import { PublicShell, publicFetch } from "../components/app/PublicShell";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Spinner } from "../components/ui/Spinner";

type View = {
  signer: { name: string; email: string; signedAt: string | null };
  request: { title: string; message: string | null; status: "pending" | "completed" | "cancelled"; sha256: string; code: string; finalReady: boolean };
  signers: { name: string; signed: boolean }[];
  orgName: string;
};

/** /assinar/:token — a signer reads the PDF and signs (no login: the link is personal). */
export function SignPage() {
  const { token = "" } = useParams();
  const [v, setV] = useState<View | null>(null);
  const [err, setErr] = useState("");
  const [name, setName] = useState("");
  const [cpf, setCpf] = useState("");
  const [agree, setAgree] = useState(false);
  const [sending, setSending] = useState(false);
  const load = () => publicFetch<View>(`${API_URL}/public/sign/${token}`).then((d) => { setV(d); document.title = `Assinar: ${d.request.title}`; }).catch((e) => setErr(e.message));
  useEffect(() => { void load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err && !v) return <PublicShell><p className="text-sm text-muted">{err}</p></PublicShell>;
  if (!v) return <PublicShell><Spinner className="h-5 w-5" label="Carregando" /></PublicShell>;
  const doc = `${API_URL}/public/sign/${token}/document`;

  const submit = async () => {
    setSending(true); setErr("");
    try {
      await publicFetch(`${API_URL}/public/sign/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, document: cpf || undefined, agree }) });
      await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Não foi possível assinar."); } finally { setSending(false); }
  };

  return (
    <PublicShell wide>
      <div className="flex flex-col gap-4">
        <div>
          {v.orgName && <p className="text-xs text-muted">{v.orgName}</p>}
          <h1 className="text-xl text-text">{v.request.title}</h1>
          <p className="text-sm text-muted">Documento para assinatura eletrônica de <strong className="text-text">{v.signer.name}</strong> ({v.signer.email})</p>
        </div>
        {v.request.message && <p className="whitespace-pre-wrap rounded-md bg-surface p-3 text-sm text-text">{v.request.message}</p>}

        {v.request.status !== "cancelled" && (
          <>
            <a href={doc} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 self-start text-sm font-medium text-accent hover:underline">
              <FileText className="h-4 w-4" aria-hidden="true" /> {v.request.finalReady ? "Abrir a via assinada (PDF)" : "Abrir o documento (PDF)"}
            </a>
            <iframe title="Documento" src={doc} className="hidden h-[32rem] w-full rounded-md border border-border sm:block" />
          </>
        )}

        <ul className="flex flex-col gap-1 text-sm">
          {v.signers.map((s, i) => (
            <li key={i} className="flex items-center gap-2 text-muted">
              {s.signed ? <CheckCircle2 className="h-4 w-4 text-success" aria-label="Assinou" /> : <Clock className="h-4 w-4" aria-label="Pendente" />} {s.name}
            </li>
          ))}
        </ul>

        {v.request.status === "cancelled" ? (
          <p className="text-sm text-muted">Este pedido de assinatura foi cancelado por quem enviou.</p>
        ) : v.signer.signedAt ? (
          <p className="inline-flex items-center gap-2 text-sm text-success">
            <CheckCircle2 className="h-5 w-5" aria-hidden="true" />
            Você assinou em {new Date(v.signer.signedAt).toLocaleString("pt-BR")}. {v.request.status === "completed" ? "Todos assinaram: a via assinada foi enviada ao seu e-mail." : "Quando todos assinarem, você recebe a via assinada por e-mail."}
          </p>
        ) : (
          <form className="flex flex-col gap-3 rounded-md border border-border p-4" onSubmit={(e) => { e.preventDefault(); void submit(); }}>
            <label className="flex flex-col gap-1 text-sm text-text">
              Seu nome completo
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={v.signer.name} autoComplete="name" />
            </label>
            <label className="flex flex-col gap-1 text-sm text-text">
              CPF <span className="text-xs text-muted">(opcional; aparece no registro de assinaturas)</span>
              <Input value={cpf} onChange={(e) => setCpf(e.target.value)} inputMode="numeric" placeholder="000.000.000-00" className="max-w-56" />
            </label>
            <label className="inline-flex items-start gap-2 text-sm text-text">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-accent" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
              Li o documento e concordo em assiná-lo eletronicamente. Entendo que esta assinatura tem validade jurídica.
            </label>
            {err && <p role="alert" className="text-sm text-danger">{err}</p>}
            <Button type="submit" loading={sending} disabled={!agree || name.trim().length < 3} className="self-start">Assinar</Button>
            <p className="text-xs text-muted">Registramos data e hora, endereço IP, navegador e o código do documento (SHA-256 {v.request.sha256.slice(0, 12)}…). Código do pedido: {v.request.code}.</p>
          </form>
        )}
      </div>
    </PublicShell>
  );
}
