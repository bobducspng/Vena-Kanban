import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { CheckCircle2, ExternalLink } from "lucide-react";
import { API_URL } from "../lib/trpc";
import type { CardFieldValue, FieldDef } from "../data/types";
import { PublicShell, publicFetch } from "../components/app/PublicShell";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { Spinner } from "../components/ui/Spinner";
import { Textarea } from "../components/ui/Textarea";

type Value = CardFieldValue["value"];
const date = (iso: string) => new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });

/** Formulário de fase por link (/t/:token): someone outside fills one phase of a card. */
export function PhaseFormPage() {
  const { token = "" } = useParams();
  type Def = { title: string; pipeName: string; phaseName: string; open: boolean; submittedAt: string | null; fields: Omit<FieldDef, "pipeId" | "editableOtherPhases">[]; values: { fieldId: string; value: Value }[] };
  const [def, setDef] = useState<Def | null>(null);
  const [err, setErr] = useState("");
  const [values, setValues] = useState<Record<string, Value>>({});
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [website, setWebsite] = useState("");

  useEffect(() => {
    publicFetch<Def>(`${API_URL}/public/phase/${token}`)
      .then((d) => { setDef(d); setValues(Object.fromEntries(d.values.map((v) => [v.fieldId, v.value]))); document.title = d.title; })
      .catch((e) => setErr(e.message));
  }, [token]);

  if (err && !def) return <PublicShell><p className="text-sm text-muted">{err}</p></PublicShell>;
  if (!def) return <PublicShell><Spinner className="h-5 w-5" label="Carregando" /></PublicShell>;
  if (sent) return <PublicShell><p className="inline-flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /> Recebido, obrigado!</p></PublicShell>;

  const submit = async () => {
    setSending(true); setErr("");
    try {
      await publicFetch(`${API_URL}/public/phase/${token}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: Object.entries(values).map(([fieldId, value]) => ({ fieldId, value })), website }),
      });
      setSent(true);
    } catch (e) { setErr(e instanceof Error ? e.message : "Erro"); } finally { setSending(false); }
  };

  return (
    <PublicShell>
      <p className="text-xs text-muted">{def.pipeName} · etapa "{def.phaseName}"</p>
      <h1 className="text-xl font-semibold text-text">{def.title}</h1>
      {!def.open ? (
        <p className="mt-6 rounded-md border border-border p-4 text-sm text-muted">Esta etapa já foi concluída; o formulário não aceita mais respostas.</p>
      ) : !def.fields.length ? (
        <p className="mt-6 text-sm text-muted">Não há campos para preencher nesta etapa.</p>
      ) : (
        <form className="mt-6 flex flex-col gap-4" noValidate onSubmit={(e) => { e.preventDefault(); void submit(); }}>
          {def.submittedAt && <p className="text-xs text-muted">Já enviado em {date(def.submittedAt)} — você pode corrigir e enviar de novo.</p>}
          {def.fields.map((f) => (
            <Field key={f.id} def={{ ...f, pipeId: "", editableOtherPhases: true }} value={values[f.id]} onChange={(v) => setValues((p) => ({ ...p, [f.id]: v }))} />
          ))}
          <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
            <label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
          </div>
          {err && <p role="alert" className="text-sm text-danger">{err}</p>}
          <Button type="submit" loading={sending} className="self-start">Enviar</Button>
        </form>
      )}
    </PublicShell>
  );
}

/** "Meus pedidos" (/pedidos/:token): status, history and messages of a request. */
export function RequestsPage() {
  const { token = "" } = useParams();
  type Data = {
    email: string | null;
    current: { number: number; title: string; phase: string; done: boolean; createdAt: string } | null;
    history: { at: string; text: string }[];
    messages: { fromRequester: boolean; body: string; createdAt: string }[];
    others: { token: string; number: number; title: string; phase: string; done: boolean; createdAt: string }[];
  };
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  const [msg, setMsg] = useState("");
  const [sending, setSending] = useState(false);
  const load = () => publicFetch<Data>(`${API_URL}/public/requests/${token}`).then((d) => { setData(d); document.title = "Meus pedidos"; }).catch((e) => setErr(e.message));
  useEffect(() => { void load(); }, [token]); // eslint-disable-line react-hooks/exhaustive-deps

  if (err && !data) return <PublicShell><p className="text-sm text-muted">{err}</p></PublicShell>;
  if (!data) return <PublicShell><Spinner className="h-5 w-5" label="Carregando" /></PublicShell>;

  const send = async () => {
    setSending(true);
    try {
      await publicFetch(`${API_URL}/public/requests/${token}/messages`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ body: msg }) });
      setMsg(""); await load();
    } catch (e) { setErr(e instanceof Error ? e.message : "Erro"); } finally { setSending(false); }
  };

  return (
    <PublicShell wide>
      <h1 className="text-xl font-semibold text-text">Meus pedidos</h1>
      {data.email && <p className="text-xs text-muted">{data.email}</p>}
      {data.current ? (
        <section aria-label="Pedido" className="mt-6 flex flex-col gap-4">
          <div className="rounded-md border border-border p-4">
            <p className="text-sm font-semibold text-text">#{data.current.number} · {data.current.title}</p>
            <p className="mt-1 text-sm">
              {data.current.done ? <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Concluído</span>
                : <span className="text-text">Situação: <strong>{data.current.phase}</strong></span>}
            </p>
            <ol className="mt-3 flex flex-col gap-1 border-l border-border pl-3 text-xs text-muted">
              {data.history.map((h, i) => <li key={i}>{date(h.at)} — {h.text}</li>)}
            </ol>
          </div>
          <div className="flex flex-col gap-2">
            <h2 className="text-sm font-semibold text-text">Mensagens</h2>
            {!data.messages.length && <p className="text-xs text-muted">Nenhuma mensagem ainda.</p>}
            <ul className="flex flex-col gap-2">
              {data.messages.map((m, i) => (
                <li key={i} className={`max-w-[85%] rounded-md p-3 text-sm ${m.fromRequester ? "self-end bg-surface" : "self-start border border-border"}`}>
                  <p className="whitespace-pre-wrap text-text">{m.body}</p>
                  <p className="mt-1 text-xs text-muted">{m.fromRequester ? "Você" : "Equipe"} · {date(m.createdAt)}</p>
                </li>
              ))}
            </ul>
            <Textarea aria-label="Nova mensagem" rows={3} value={msg} onChange={(e) => setMsg(e.target.value)} placeholder="Escreva para a equipe" />
            {err && <p role="alert" className="text-sm text-danger">{err}</p>}
            <Button className="self-start" disabled={!msg.trim()} loading={sending} onClick={() => void send()}>Enviar mensagem</Button>
          </div>
        </section>
      ) : <p className="mt-6 text-sm text-muted">Esta solicitação não está mais disponível.</p>}

      {data.others.length > 0 && (
        <section aria-label="Outros pedidos" className="mt-8 flex flex-col gap-2">
          <h2 className="text-sm font-semibold text-text">Seus outros pedidos</h2>
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
            {data.others.map((o) => (
              <li key={o.token}>
                <Link to={`/pedidos/${o.token}`} className="flex items-center justify-between gap-2 px-3 py-2 text-sm hover:bg-surface">
                  <span className="truncate text-text">#{o.number} · {o.title}</span>
                  <span className={`text-xs ${o.done ? "text-success" : "text-muted"}`}>{o.done ? "Concluído" : o.phase}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
    </PublicShell>
  );
}

/** Portal (/portal): forms the admins chose to list. */
export function PortalPage() {
  type Data = { name: string; forms: { title: string; icon: string | null; description: string; url: string; closed: boolean }[] };
  const [data, setData] = useState<Data | null>(null);
  const [err, setErr] = useState("");
  useEffect(() => { publicFetch<Data>(`${API_URL}/public/portal`).then((d) => { setData(d); document.title = d.name; }).catch((e) => setErr(e.message)); }, []);
  if (err) return <PublicShell><p className="text-sm text-muted">{err}</p></PublicShell>;
  if (!data) return <PublicShell><Spinner className="h-5 w-5" label="Carregando" /></PublicShell>;
  return (
    <PublicShell wide>
      <h1 className="text-xl font-semibold text-text">{data.name}</h1>
      <p className="text-sm text-muted">Escolha o que você precisa solicitar.</p>
      {!data.forms.length ? <p className="mt-6 text-sm text-muted">Nenhum formulário disponível.</p> : (
        <ul className="mt-6 grid gap-3 sm:grid-cols-2">
          {data.forms.map((f) => (
            <li key={f.url}>
              <a href={f.url} className="flex h-full flex-col gap-1 rounded-lg border border-border p-4 hover:border-accent">
                <span className="inline-flex items-center gap-2 text-sm font-semibold text-text">{f.icon && <span aria-hidden="true">{f.icon}</span>}{f.title}<ExternalLink className="h-3.5 w-3.5 text-muted" aria-hidden="true" /></span>
                {f.description && <span className="line-clamp-3 text-xs text-muted">{f.description}</span>}
                {f.closed && <span className="text-xs text-warning">Fechado no momento</span>}
              </a>
            </li>
          ))}
        </ul>
      )}
    </PublicShell>
  );
}
