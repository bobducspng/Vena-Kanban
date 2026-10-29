import { useState } from "react";
import { useParams, Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AlarmClock, CalendarClock, Clock } from "lucide-react";
import { api } from "../data/store";
import { AppShell } from "../components/app/AppShell";
import { PipeTabs } from "../components/app/PipeTabs";
import { BarList, ChartCard, DataTable, GroupedColumns, StatTile } from "../components/app/Charts";
import { Select } from "../components/ui/Select";
import { Spinner } from "../components/ui/Spinner";

const dur = (min: number, business: boolean) => {
  const day = business ? 600 : 1440;
  if (min >= day) return `${(min / day).toFixed(1).replace(".", ",")} ${business ? "d úteis" : "d"}`;
  if (min >= 60) return `${(min / 60).toFixed(1).replace(".", ",")} h`;
  return `${min} min`;
};
const ddmm = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

/** S16-ish — pipe dashboard: headline numbers, where cards are, where they wait, throughput, load. */
export function PipeDashboard() {
  const { pipeId = "" } = useParams();
  const [days, setDays] = useState(90);
  const { data: pipe } = useQuery({ queryKey: ["pipe", pipeId], queryFn: () => api.pipe.get(pipeId) });
  const { data, isLoading } = useQuery({ queryKey: ["dashboard", pipeId, days], queryFn: () => api.dashboard.pipe(pipeId, days) });

  const slowest = data ? data.timeInPhase.reduce<{ phaseId: string; avgMinutes: number } | null>((m, t) => (t.avgMinutes != null && (!m || t.avgMinutes > m.avgMinutes) ? { phaseId: t.phaseId, avgMinutes: t.avgMinutes } : m), null) : null;
  const k = data?.kpis;

  return (
    <AppShell title={pipe ? `${pipe.name} · Dashboard` : "Dashboard"}>
      <div className="flex flex-col gap-4 p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <Link to="/" className="text-xs text-muted hover:text-accent">← Pipes</Link>
            <h2 className="truncate text-lg text-text">{pipe?.icon && <span className="mr-1.5" aria-hidden="true">{pipe.icon}</span>}{pipe?.name ?? "…"}</h2>
            <PipeTabs pipeId={pipeId} />
          </div>
          {/* One filter row, above the charts. */}
          <div className="w-48">
            <Select aria-label="Período" value={String(days)} onValueChange={(v) => setDays(Number(v))}
              options={[{ value: "30", label: "Últimos 30 dias" }, { value: "90", label: "Últimos 90 dias" }, { value: "180", label: "Últimos 180 dias" }, { value: "365", label: "Últimos 12 meses" }]} />
          </div>
        </div>

        {isLoading || !data || !k ? <Spinner className="h-5 w-5" label="Carregando" /> : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <StatTile label="Em andamento" value={String(k.open)} hint={data.unassigned ? `${data.unassigned} sem responsável` : undefined} />
              <StatTile label="Concluídos" value={String(k.done)} hint={`nos últimos ${days} dias`} />
              <StatTile label="Lead time médio" value={k.leadTimeDays == null ? "—" : `${String(k.leadTimeDays).replace(".", ",")} d`} hint="da criação à conclusão" />
              <StatTile label="Atrasados" value={String(k.late)} tone={k.late ? "warning" : undefined} icon={Clock} hint="passaram do SLA da fase" />
              <StatTile label="Expirados" value={String(k.expired)} tone={k.expired ? "danger" : undefined} icon={AlarmClock} hint="passaram do prazo do pipe" />
              <StatTile label="Vencidos" value={String(k.overdue)} tone={k.overdue ? "danger" : undefined} icon={CalendarClock} hint="data de vencimento passou" />
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <ChartCard title="Tempo médio em cada fase" subtitle={`Estadias encerradas nos últimos ${days} dias${data.businessHours ? " · horário útil" : ""}. A mais lenta é o gargalo.`}
                table={<DataTable head={["Fase", "Tempo médio", "Estadias"]} rows={data.timeInPhase.map((t) => [t.name, t.avgMinutes == null ? "—" : dur(t.avgMinutes, data.businessHours), t.samples])} />}>
                <BarList empty="Ainda sem cards que saíram de uma fase no período."
                  rows={data.timeInPhase.map((t) => ({ label: t.name, value: t.avgMinutes, flag: slowest?.phaseId === t.phaseId && data.timeInPhase.filter((x) => x.avgMinutes != null).length > 1 ? "gargalo" : undefined, note: `${t.samples} estadia(s)` }))}
                  format={(v) => dur(v, data.businessHours)} />
              </ChartCard>

              <ChartCard title="Cards em andamento por fase" subtitle="Onde o trabalho está agora."
                table={<DataTable head={["Fase", "Cards", "Atrasados"]} rows={data.byPhase.filter((p) => !p.isEnd).map((p) => [p.name, p.open, p.late])} />}>
                <BarList empty="Nenhum card em andamento." format={(v) => String(v)}
                  rows={data.byPhase.filter((p) => !p.isEnd).map((p) => ({ label: p.name, value: p.open, note: p.late ? `${p.late} atrasado(s)` : undefined }))} />
              </ChartCard>

              <ChartCard title="Criados × concluídos por semana" subtitle="Últimas 12 semanas (segunda a domingo)."
                table={<DataTable head={["Semana de", "Criados", "Concluídos"]} rows={data.weekly.map((w) => [ddmm(w.weekStart), w.created, w.done])} />}>
                <GroupedColumns labels={data.weekly.map((w) => ddmm(w.weekStart))} tooltipTitle={(i) => `Semana de ${ddmm(data.weekly[i].weekStart)}`}
                  series={[
                    { name: "Criados", color: "var(--viz-1)", values: data.weekly.map((w) => w.created) },
                    { name: "Concluídos", color: "var(--viz-2)", values: data.weekly.map((w) => w.done) },
                  ]} />
              </ChartCard>

              <ChartCard title="Carga por responsável" subtitle="Cards em andamento de cada pessoa."
                table={<DataTable head={["Responsável", "Em andamento", "Com alerta"]} rows={data.byPerson.map((p) => [p.name, p.open, p.late])} />}>
                <BarList empty="Nenhum card atribuído." format={(v) => String(v)}
                  rows={data.byPerson.map((p) => ({ label: p.name, value: p.open, note: p.late ? `${p.late} com alerta` : undefined }))} />
              </ChartCard>
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
