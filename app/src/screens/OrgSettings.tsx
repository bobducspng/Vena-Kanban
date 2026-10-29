import { useEffect, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { api } from "../data/store";
import type { BusinessCalendar } from "../data/types";
import { useMe } from "../lib/useMe";
import { cn } from "../lib/cn";
import { AppShell } from "../components/app/AppShell";
import { Button } from "../components/ui/Button";
import { Input } from "../components/ui/Input";
import { Spinner } from "../components/ui/Spinner";
import { useToast } from "../components/ui/Toast";
import { BiSettings } from "../components/app/BiSettings";
import { PeopleSettings } from "../components/app/PeopleSettings";

const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const fmt = (d: string) => { const [y, m, dd] = d.split("-"); return `${dd}/${m}/${y}`; };

/** S19-ish — organisation settings: expediente + feriados (SLAs in business time). */
export function OrgSettings() {
  const qc = useQueryClient();
  const toast = useToast();
  const { me, isAdmin } = useMe();
  const { data, isLoading } = useQuery({ queryKey: ["calendar"], queryFn: api.calendar.get });
  const [cal, setCal] = useState<BusinessCalendar | null>(null);
  const [newDate, setNewDate] = useState("");
  const [newName, setNewName] = useState("");
  useEffect(() => { if (data) setCal(data); }, [data]);

  const save = useMutation({
    mutationFn: () => api.calendar.update(cal!),
    onSuccess: (c) => { qc.setQueryData(["calendar"], c); toast("Calendário salvo", "success"); },
    onError: (e) => toast(e instanceof Error ? e.message : "Não foi possível salvar", "error"),
  });
  const national = useMutation({
    mutationFn: api.calendar.nationalHolidays,
    onSuccess: (list) => {
      setCal((c) => c && { ...c, holidays: [...new Map([...c.holidays, ...list].map((h) => [h.date, h])).values()].sort((a, b) => a.date.localeCompare(b.date)) });
      toast("Feriados nacionais adicionados — clique em Salvar", "success");
    },
  });

  if (me && !isAdmin) return <AppShell title="Configurações"><p className="p-6 text-sm text-muted">Só administradores alteram as configurações da organização.</p></AppShell>;
  const dirty = JSON.stringify(cal) !== JSON.stringify(data);

  return (
    <AppShell title="Configurações">
      <div className="mx-auto flex max-w-content flex-col gap-6 p-6">
        <div>
          <h2 className="text-xl text-text">Configurações da organização</h2>
          <p className="text-sm text-muted">Expediente e feriados usados pelos prazos dos pipes que contam só horário útil.</p>
        </div>

        {isLoading || !cal ? <Spinner className="h-4 w-4" label="Carregando" /> : (
          <>
            <section aria-label="Expediente" className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <h3 className="text-sm font-semibold text-text">Expediente</h3>
              <div className="flex flex-wrap gap-2">
                {WEEKDAYS.map((d, i) => {
                  const on = cal.weekdays.includes(i);
                  return (
                    <button key={d} type="button" aria-pressed={on}
                      onClick={() => setCal({ ...cal, weekdays: on ? cal.weekdays.filter((x) => x !== i) : [...cal.weekdays, i].sort() })}
                      className={cn("rounded-pill border px-3 py-1 text-sm", on ? "border-accent bg-surface text-text" : "border-border text-muted")}>{d}</button>
                  );
                })}
              </div>
              <div className="flex flex-wrap items-center gap-3 text-sm text-text">
                <label className="flex items-center gap-2">Das <Input type="time" aria-label="Início" value={cal.startTime} onChange={(e) => setCal({ ...cal, startTime: e.target.value })} className="w-32" /></label>
                <label className="flex items-center gap-2">às <Input type="time" aria-label="Fim" value={cal.endTime} onChange={(e) => setCal({ ...cal, endTime: e.target.value })} className="w-32" /></label>
                <span className="text-xs text-muted">(horário de Brasília)</span>
              </div>
            </section>

            <section aria-label="Feriados" className="flex flex-col gap-3 rounded-lg border border-border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-text">Feriados ({cal.holidays.length})</h3>
                <Button size="sm" variant="secondary" loading={national.isPending} onClick={() => national.mutate()}>Adicionar nacionais (este ano e o próximo)</Button>
              </div>
              <p className="text-xs text-muted">Carnaval e Corpus Christi são pontos facultativos: adicione se a empresa não trabalha. Inclua também os estaduais e municipais.</p>
              <form className="flex flex-wrap gap-2" onSubmit={(e) => {
                e.preventDefault();
                if (!newDate || !newName.trim()) return;
                setCal({ ...cal, holidays: [...cal.holidays.filter((h) => h.date !== newDate), { date: newDate, name: newName.trim() }].sort((a, b) => a.date.localeCompare(b.date)) });
                setNewDate(""); setNewName("");
              }}>
                <Input type="date" aria-label="Data do feriado" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="w-44" />
                <div className="min-w-48 flex-1"><Input aria-label="Nome do feriado" placeholder="Ex.: Aniversário da cidade" value={newName} onChange={(e) => setNewName(e.target.value)} /></div>
                <Button type="submit" variant="secondary" disabled={!newDate || !newName.trim()}><Plus className="h-4 w-4" aria-hidden="true" /> Adicionar</Button>
              </form>
              <ul className="flex max-h-80 flex-col divide-y divide-border overflow-y-auto rounded-md border border-border">
                {cal.holidays.map((h) => (
                  <li key={h.date} className="flex items-center gap-3 px-3 py-1.5 text-sm">
                    <span className="w-24 text-muted">{fmt(h.date)}</span>
                    <span className="flex-1 text-text">{h.name}</span>
                    <button aria-label={`Remover ${h.name}`} onClick={() => setCal({ ...cal, holidays: cal.holidays.filter((x) => x.date !== h.date) })} className="rounded p-1 text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            </section>

            <div className="flex justify-end gap-2">
              {dirty && <Button variant="secondary" onClick={() => setCal(data!)}>Descartar</Button>}
              <Button onClick={() => save.mutate()} loading={save.isPending} disabled={!dirty || !cal.weekdays.length}>Salvar</Button>
            </div>

            <PeopleSettings />

            <BiSettings />
          </>
        )}
      </div>
    </AppShell>
  );
}
