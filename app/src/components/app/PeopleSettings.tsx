import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Trash2 } from "lucide-react";
import { api } from "../../data/store";
import { useMe } from "../../lib/useMe";
import { Avatar } from "../ui/Avatar";
import { Select } from "../ui/Select";
import { useToast } from "../ui/Toast";

type MemberRole = "member" | "my_cards" | "read";
export const PIPE_ROLE_LABEL: Record<MemberRole, string> = {
  member: "Membro (todos os cards)",
  my_cards: "Só os próprios cards",
  read: "Somente leitura",
};
const ROLE_OPTIONS = (Object.keys(PIPE_ROLE_LABEL) as MemberRole[]).map((value) => ({ value, label: PIPE_ROLE_LABEL[value] }));
const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Algo deu errado");

/** Configurações > Pessoas: who is in the organisation, admin or not, and in which pipes. */
export function PeopleSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const { me } = useMe();
  const { data: people } = useQuery({ queryKey: ["people"], queryFn: api.people.list });
  const { data: pipes } = useQuery({ queryKey: ["pipes"], queryFn: api.pipe.list });
  const pipeName = new Map((pipes ?? []).map((p) => [p.id, p.name]));
  const done = () => qc.invalidateQueries({ queryKey: ["people"] });
  const setRole = useMutation({
    mutationFn: (v: { userId: string; role: "admin" | "member" }) => api.people.setOrgRole(v.userId, v.role),
    onSuccess: () => { done(); toast("Papel alterado", "success"); },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const remove = useMutation({
    mutationFn: api.people.remove,
    onSuccess: () => { done(); toast("Pessoa removida", "success"); },
    onError: (e) => toast(errMsg(e), "error"),
  });

  return (
    <section aria-label="Pessoas" className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div>
        <h3 className="text-sm font-semibold text-text">Pessoas ({people?.length ?? 0})</h3>
        <p className="text-xs text-muted">
          Quem entra com o Google da empresa aparece aqui, sem acesso a nenhum pipe. Administradores veem e configuram todos os pipes;
          os demais só veem os pipes em que foram adicionados (em cada pipe: Configurar → Membros).
        </p>
      </div>
      <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
        {(people ?? []).map((p) => (
          <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
            <Avatar name={p.name ?? p.email} size="sm" />
            <div className="min-w-48 flex-1">
              <div className="text-text">{p.name ?? p.email}{p.id === me?.id && <span className="text-muted"> (você)</span>}</div>
              <div className="text-xs text-muted">
                {p.email}
                {p.role !== "admin" && ` · ${p.pipes.length ? p.pipes.map((m) => pipeName.get(m.pipeId)).filter(Boolean).join(", ") : "nenhum pipe"}`}
              </div>
            </div>
            <div className="w-44">
              <Select aria-label={`Papel de ${p.name ?? p.email}`} value={p.role === "admin" ? "admin" : "member"}
                options={[{ value: "admin", label: "Administrador" }, { value: "member", label: "Membro" }]}
                disabled={setRole.isPending}
                onValueChange={(v) => {
                  if (v === p.role) return;
                  if (v === "member" && !confirm("Deixar de ser administrador? A pessoa passa a ver só os pipes em que for adicionada.")) return;
                  setRole.mutate({ userId: p.id, role: v as "admin" | "member" });
                }} />
            </div>
            {p.id !== me?.id && (
              <button aria-label={`Remover ${p.name ?? p.email}`} title="Remover da organização"
                onClick={() => { if (confirm(`Remover ${p.name ?? p.email} da organização? A pessoa perde o acesso e sai dos cards em que é responsável. O histórico continua.`)) remove.mutate(p.id); }}
                className="rounded p-1 text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Configurar pipe > Membros: who (besides admins) works in this pipe, and how. */
export function PipeMembers({ pipeId }: { pipeId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [adding, setAdding] = useState("");
  const { data: people } = useQuery({ queryKey: ["people"], queryFn: api.people.list });
  const { data: members } = useQuery({ queryKey: ["pipeMembers", pipeId], queryFn: () => api.people.pipeMembers(pipeId) });
  const set = useMutation({
    mutationFn: (v: { userId: string; role: MemberRole | null }) => api.people.setPipeRole(pipeId, v.userId, v.role),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["pipeMembers", pipeId] }); qc.invalidateQueries({ queryKey: ["people"] }); },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const roleOf = new Map((members ?? []).map((m) => [m.userId, m.role as MemberRole]));
  const nonAdmins = (people ?? []).filter((p) => p.role !== "admin");
  const inPipe = nonAdmins.filter((p) => roleOf.has(p.id));
  const outside = nonAdmins.filter((p) => !roleOf.has(p.id));

  return (
    <section aria-label="Membros" className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div>
        <h3 className="text-sm font-semibold text-text">Membros ({inPipe.length})</h3>
        <p className="text-xs text-muted">Só quem está aqui vê este pipe. Administradores da organização têm acesso a todos os pipes e não precisam ser adicionados.</p>
      </div>
      {inPipe.length > 0 && (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {inPipe.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <Avatar name={p.name ?? p.email} size="sm" />
              <div className="min-w-40 flex-1"><div className="text-text">{p.name ?? p.email}</div><div className="text-xs text-muted">{p.email}</div></div>
              <div className="w-56">
                <Select aria-label={`Acesso de ${p.name ?? p.email}`} value={roleOf.get(p.id)} options={ROLE_OPTIONS}
                  onValueChange={(v) => set.mutate({ userId: p.id, role: v as MemberRole })} />
              </div>
              <button aria-label={`Tirar ${p.name ?? p.email} do pipe`} title="Tirar do pipe"
                onClick={() => set.mutate({ userId: p.id, role: null })}
                className="rounded p-1 text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
      {outside.length > 0 ? (
        <div className="w-full max-w-sm">
          <Select aria-label="Adicionar pessoa ao pipe" placeholder="Adicionar pessoa…" value={adding}
            options={outside.map((p) => ({ value: p.id, label: p.name ? `${p.name} (${p.email})` : p.email }))}
            onValueChange={(v) => { setAdding(""); set.mutate({ userId: v, role: "member" }); }} />
        </div>
      ) : (
        <p className="text-xs text-muted">{nonAdmins.length ? "Todas as pessoas já estão neste pipe." : "Ainda não há pessoas além dos administradores. Elas aparecem depois do primeiro login."}</p>
      )}
    </section>
  );
}
