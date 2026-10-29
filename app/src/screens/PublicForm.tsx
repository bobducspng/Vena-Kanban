import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { API_URL } from "../lib/trpc";
import { fieldStates, type ConditionDef } from "../lib/conditions";
import { withState } from "../lib/useFieldStates";
import type { CardFieldValue, FieldDef } from "../data/types";
import { Button } from "../components/ui/Button";
import { Field } from "../components/ui/Field";
import { Input } from "../components/ui/Input";
import { Spinner } from "../components/ui/Spinner";

type Value = CardFieldValue["value"];
interface Definition {
  title: string;
  pipeIcon: string | null;
  closed: boolean;
  branding: { description: string; color: string; buttonText: string; confirmMessage: string; allowMultiple: boolean; askEmail: "no" | "optional" | "required" };
  fields: Omit<FieldDef, "pipeId" | "editableOtherPhases">[];
  conditions: ConditionDef[];
}

/** Formulário público: no login, no app chrome. Embeddable (iframe). */
export function PublicForm() {
  const { slug = "" } = useParams();
  const [def, setDef] = useState<Definition | null>(null);
  const [loadError, setLoadError] = useState("");
  const [values, setValues] = useState<Record<string, Value>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [email, setEmail] = useState("");
  const [website, setWebsite] = useState(""); // honeypot
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ number: number | null } | null>(null);

  useEffect(() => {
    fetch(`${API_URL}/public/forms/${slug}`)
      .then(async (r) => { const d = await r.json(); if (!r.ok) throw new Error(d.error); setDef(d); document.title = d.title; })
      .catch((e) => setLoadError(e instanceof Error ? e.message : "Formulário indisponível."));
  }, [slug]);

  if (loadError) return <Shell><p className="text-sm text-muted">{loadError}</p></Shell>;
  if (!def) return <Shell><Spinner className="h-5 w-5" label="Carregando formulário" /></Shell>;

  const fields: FieldDef[] = def.fields.map((f) => ({ ...f, pipeId: "", editableOtherPhases: true }));
  const states = fieldStates(fields, def.conditions, values);
  const visible = fields.filter((f) => states.get(f.id)?.visible !== false);
  const accent = { "--color-accent": def.branding.color, "--color-accent-hover": def.branding.color } as React.CSSProperties;

  const submit = async () => {
    setError("");
    // Required + visible, checked here too for instant feedback (the server checks again).
    const missing = visible.filter((f) => states.get(f.id)?.required && (values[f.id] === undefined || values[f.id] === null || values[f.id] === "" || values[f.id] === false || (Array.isArray(values[f.id]) && !(values[f.id] as string[]).length)));
    if (missing.length || (def.branding.askEmail === "required" && !email.trim())) {
      setErrors(Object.fromEntries(missing.map((f) => [f.id, "Campo obrigatório"])));
      setError("Preencha os campos obrigatórios.");
      return;
    }
    setSending(true);
    try {
      const r = await fetch(`${API_URL}/public/forms/${slug}`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ values: visible.filter((f) => f.id in values).map((f) => ({ fieldId: f.id, value: values[f.id] })), email: email.trim(), website }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error);
      setDone({ number: d.number });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível enviar.");
    } finally {
      setSending(false);
    }
  };

  if (done) {
    return (
      <Shell style={accent}>
        <h1 className="text-xl font-semibold text-text">{def.title}</h1>
        <p className="mt-4 whitespace-pre-line text-sm text-text">{def.branding.confirmMessage}</p>
        {done.number && <p className="mt-2 text-sm text-muted">Número da solicitação: <strong>#{done.number}</strong></p>}
        {def.branding.allowMultiple && (
          <Button className="mt-6" onClick={() => { setValues({}); setErrors({}); setDone(null); }}>Enviar outra resposta</Button>
        )}
      </Shell>
    );
  }

  return (
    <Shell style={accent}>
      <h1 className="text-xl font-semibold text-text">{def.pipeIcon && <span className="mr-1.5" aria-hidden="true">{def.pipeIcon}</span>}{def.title}</h1>
      {def.branding.description && <p className="mt-2 whitespace-pre-line text-sm text-muted">{def.branding.description}</p>}
      {def.closed ? (
        <p className="mt-6 rounded-md border border-border p-4 text-sm text-muted">Este formulário não está recebendo respostas no momento.</p>
      ) : (
        <form className="mt-6 flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); void submit(); }} noValidate>
          {visible.map((f) => (
            <Field key={f.id} def={withState(f, states.get(f.id))} value={values[f.id]} error={errors[f.id]}
              onChange={(v) => { setValues((p) => ({ ...p, [f.id]: v })); setErrors((p) => ({ ...p, [f.id]: "" })); }} />
          ))}
          {def.branding.askEmail !== "no" && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="pf-email" className="text-sm font-medium text-text">
                Seu e-mail {def.branding.askEmail === "required" ? <span className="text-muted">(obrigatório)</span> : <span className="text-muted">(opcional, para receber a confirmação)</span>}
              </label>
              <Input id="pf-email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
          )}
          {/* Honeypot: hidden from people and screen readers; bots fill it. */}
          <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
            <label>Website<input tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} /></label>
          </div>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <Button type="submit" loading={sending} className="self-start">{def.branding.buttonText || "Enviar"}</Button>
        </form>
      )}
    </Shell>
  );
}

function Shell({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return (
    <div className="min-h-screen bg-surface px-4 py-8" style={style}>
      <main className="mx-auto max-w-xl rounded-lg bg-bg p-6 shadow-card">{children}</main>
      <p className="mt-4 text-center text-xs text-muted">Enviado com Fluxos</p>
    </div>
  );
}
