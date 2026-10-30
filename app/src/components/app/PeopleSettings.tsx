import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2, Users } from "lucide-react";
import { api } from "../../data/store";
import { useMe } from "../../lib/useMe";
import { Avatar } from "../ui/Avatar";
import { Select } from "../ui/Select";
import { Input } from "../ui/Input";
import { Button } from "../ui/Button";
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
  const { data: groups } = useQuery({ queryKey: ["groups"], queryFn: api.people.groups });
  const { data: pipeGroups } = useQuery({ queryKey: ["pipeGroups", pipeId], queryFn: () => api.people.pipeGroups(pipeId) });
  const setGroup = useMutation({
    mutationFn: (v: { groupId: string; role: MemberRole | null }) => api.people.setPipeGroupRole(pipeId, v.groupId, v.role),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pipeGroups", pipeId] }),
    onError: (e) => toast(errMsg(e), "error"),
  });
  const groupRole = new Map((pipeGroups ?? []).map((g) => [g.groupId, g.role as MemberRole]));
  const roleOf = new Map((members ?? []).map((m) => [m.userId, m.role as MemberRole]));
  const nonAdmins = (people ?? []).filter((p) => p.role !== "admin");
  const inPipe = nonAdmins.filter((p) => roleOf.has(p.id));
  const outside = nonAdmins.filter((p) => !roleOf.has(p.id));

  return (
    <section aria-label="Membros" className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div>
        <h3 className="text-sm font-semibold text-text">Membros ({inPipe.length})</h3>
        <p className="text-xs text-muted">Só quem está aqui (direto ou por um grupo) vê este pipe. Se a pessoa estiver nos dois, vale o maior acesso. Administradores da organização veem todos os pipes.</p>
      </div>
      {!!groups?.length && (
        <div className="flex flex-col gap-2">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Grupos</h4>
          {(groups ?? []).filter((g) => groupRole.has(g.id)).map((g) => (
            <div key={g.id} className="flex flex-wrap items-center gap-3 rounded-md border border-border px-3 py-2 text-sm">
              <Users className="h-4 w-4 text-muted" aria-hidden="true" />
              <div className="min-w-40 flex-1"><div className="text-text">{g.name}</div><div className="text-xs text-muted">{g.userIds.length} pessoa(s)</div></div>
              <div className="w-56"><Select aria-label={`Acesso do grupo ${g.name}`} value={groupRole.get(g.id)} options={ROLE_OPTIONS} onValueChange={(v) => setGroup.mutate({ groupId: g.id, role: v as MemberRole })} /></div>
              <button aria-label={`Tirar o grupo ${g.name} do pipe`} onClick={() => setGroup.mutate({ groupId: g.id, role: null })} className="rounded p-1 text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button>
            </div>
          ))}
          {(groups ?? []).some((g) => !groupRole.has(g.id)) && (
            <div className="w-full max-w-sm">
              <Select aria-label="Adicionar grupo ao pipe" placeholder="Adicionar grupo…" value=""
                options={(groups ?? []).filter((g) => !groupRole.has(g.id)).map((g) => ({ value: g.id, label: `${g.name} (${g.userIds.length})` }))}
                onValueChange={(v) => setGroup.mutate({ groupId: v, role: "member" })} />
            </div>
          )}
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">Pessoas</h4>
        </div>
      )}
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

/** Configurações > Pessoas > Grupos: pessoas agrupadas para dar acesso a pipes de uma vez. */
export function GroupsSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const { data: groups } = useQuery({ queryKey: ["groups"], queryFn: api.people.groups });
  const { data: people } = useQuery({ queryKey: ["people"], queryFn: api.people.list });
  const [editing, setEditing] = useState<{ id?: string; name: string; userIds: string[] } | null>(null);
  const done = () => { qc.invalidateQueries({ queryKey: ["groups"] }); qc.invalidateQueries({ queryKey: ["pipeGroups"] }); };
  const save = useMutation({
    mutationFn: () => api.people.saveGroup({ id: editing!.id, name: editing!.name.trim(), userIds: editing!.userIds }),
    onSuccess: () => { done(); setEditing(null); toast("Grupo salvo", "success"); },
    onError: (e) => toast(errMsg(e), "error"),
  });
  const remove = useMutation({ mutationFn: api.people.removeGroup, onSuccess: done, onError: (e) => toast(errMsg(e), "error") });
  const nameOf = (id: string) => people?.find((p) => p.id === id)?.name ?? people?.find((p) => p.id === id)?.email ?? "?";

  return (
    <section aria-label="Grupos" className="flex flex-col gap-3 rounded-lg border border-border p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="inline-flex items-center gap-2 text-sm font-semibold text-text"><Users className="h-4 w-4" aria-hidden="true" /> Grupos</h3>
          <p className="text-xs text-muted">Ex.: Financeiro, Compras. No pipe (Configurar → Membros) adicione o grupo inteiro; quem entra ou sai do grupo ganha ou perde o acesso.</p>
        </div>
        <Button size="sm" onClick={() => setEditing({ name: "", userIds: [] })}><Plus className="h-4 w-4" aria-hidden="true" /> Novo grupo</Button>
      </div>
      {!!groups?.length && (
        <ul className="flex flex-col divide-y divide-border rounded-md border border-border">
          {groups.map((g) => (
            <li key={g.id} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <span className="font-medium text-text">{g.name}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-muted">{g.userIds.length ? g.userIds.map(nameOf).join(", ") : "sem pessoas"}</span>
              <button aria-label={`Editar ${g.name}`} onClick={() => setEditing({ id: g.id, name: g.name, userIds: g.userIds })} className="rounded p-1 text-muted hover:text-text"><Pencil className="h-4 w-4" /></button>
              <button aria-label={`Excluir ${g.name}`} onClick={() => { if (confirm(`Excluir o grupo "${g.name}"? As pessoas perdem o acesso que tinham só por ele.`)) remove.mutate(g.id); }} className="rounded p-1 text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <div className="flex flex-col gap-2 rounded-md border border-accent p-3">
          <Input aria-label="Nome do grupo" placeholder="Nome do grupo" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
          <div className="flex max-h-48 flex-wrap gap-x-4 gap-y-1 overflow-auto">
            {(people ?? []).map((p) => (
              <label key={p.id} className="inline-flex items-center gap-2 text-sm text-text">
                <input type="checkbox" className="h-4 w-4 accent-accent" checked={editing.userIds.includes(p.id)}
                  onChange={(e) => setEditing({ ...editing, userIds: e.target.checked ? [...editing.userIds, p.id] : editing.userIds.filter((x) => x !== p.id) })} />
                {p.name ?? p.email}
              </label>
            ))}
          </div>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
            <Button size="sm" onClick={() => save.mutate()} loading={save.isPending} disabled={!editing.name.trim()}>Salvar</Button>
          </div>
        </div>
      )}
    </section>
  );
}
