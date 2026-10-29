import { useState } from "react";
import { cn } from "../../lib/cn";

/**
 * Small chart kit for the dashboards (dataviz rules): thin marks with a 4px rounded
 * data-end, hairline grid, values in text tokens (never the series color), a legend
 * for 2+ series, hover/focus tooltips, and a table view for every chart.
 * Colors: --viz-1 / --viz-2 (validated with the dataviz palette validator, both themes).
 */

/** A headline number (the form when the data is one value). */
export function StatTile({ label, value, hint, tone, icon: Icon }: {
  label: string; value: string; hint?: string; tone?: "warning" | "danger"; icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-bg p-4">
      <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", tone === "danger" ? "text-danger" : tone === "warning" ? "text-warning" : "text-muted")}>
        {Icon && <Icon className="h-3.5 w-3.5" aria-hidden="true" />}{label}
      </span>
      <span className="text-2xl font-semibold text-text">{value}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

export function ChartCard({ title, subtitle, children, table }: { title: string; subtitle?: string; children: React.ReactNode; table: React.ReactNode }) {
  const [asTable, setAsTable] = useState(false);
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-3 rounded-lg border border-border bg-bg p-4">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="text-sm font-semibold text-text">{title}</h3>
          {subtitle && <p className="text-xs text-muted">{subtitle}</p>}
        </div>
        <button className="shrink-0 text-xs text-accent" onClick={() => setAsTable((t) => !t)}>{asTable ? "Ver gráfico" : "Ver tabela"}</button>
      </div>
      {asTable ? <div className="overflow-x-auto">{table}</div> : children}
    </section>
  );
}

export function DataTable({ head, rows }: { head: string[]; rows: (string | number)[][] }) {
  return (
    <table className="min-w-full text-left text-sm">
      <thead className="text-xs text-muted"><tr>{head.map((h) => <th key={h} scope="col" className="px-2 py-1 font-medium">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-border">
        {rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} className={cn("px-2 py-1", j === 0 ? "text-text" : "text-muted")}>{c}</td>)}</tr>)}
      </tbody>
    </table>
  );
}

/** Horizontal bars, one series: label · bar (from a shared baseline) · value at the tip.
 *  `flag` marks a row with text + icon (e.g. the bottleneck), never with color alone. */
export function BarList({ rows, format, empty }: {
  rows: { label: string; value: number | null; flag?: string; note?: string }[]; format: (v: number) => string; empty: string;
}) {
  const max = Math.max(0, ...rows.map((r) => r.value ?? 0));
  if (!rows.length || max === 0) return <p className="text-sm text-muted">{empty}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {rows.map((r) => (
        <li key={r.label} tabIndex={0} title={`${r.label}: ${r.value == null ? "sem dados" : format(r.value)}${r.note ? ` · ${r.note}` : ""}`}
          className="group grid grid-cols-[minmax(6rem,10rem)_minmax(0,1fr)_auto] items-center gap-3 rounded outline-offset-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-accent">
          <span className="truncate text-sm text-text">
            {r.label}
            {r.flag && <span className="ml-1.5 rounded-pill border border-border px-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted">{r.flag}</span>}
          </span>
          <span className="relative h-4">
            {r.value != null && r.value > 0 && (
              <span className="absolute inset-y-0 left-0 rounded-r-[4px] transition-opacity group-hover:opacity-80"
                style={{ width: `${Math.max(1.5, (r.value / max) * 100)}%`, background: "var(--viz-1)" }} />
            )}
          </span>
          <span className="w-20 text-right text-sm tabular-nums text-text">{r.value == null ? "—" : format(r.value)}</span>
        </li>
      ))}
    </ul>
  );
}

/** Grouped columns per period, two series (one shared y-axis: both are counts). */
export function GroupedColumns({ labels, series, tooltipTitle }: {
  labels: string[]; series: { name: string; color: string; values: number[] }[]; tooltipTitle: (i: number) => string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 640, H = 220, padL = 32, padB = 24, padT = 8;
  const max = Math.max(1, ...series.flatMap((s) => s.values));
  const step = max <= 5 ? 1 : max <= 10 ? 2 : max <= 25 ? 5 : max <= 50 ? 10 : Math.ceil(max / 5 / 10) * 10;
  const top = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: top / step + 1 }, (_, i) => i * step);
  const plotW = W - padL, plotH = H - padB - padT;
  const band = plotW / labels.length;
  const barW = Math.min(12, (band - 8) / series.length - 2);
  const y = (v: number) => padT + plotH - (v / top) * plotH;

  return (
    <div className="relative">
      <div className="mb-2 flex flex-wrap gap-4 text-xs text-muted" aria-hidden="true">
        {series.map((s) => <span key={s.name} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />{s.name}</span>)}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label={`${series.map((s) => s.name).join(" e ")} por semana`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={padL} x2={W} y1={y(t)} y2={y(t)} stroke="var(--viz-grid)" strokeWidth={1} />
            <text x={padL - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" fontSize={10} fill="var(--color-text-muted)">{t}</text>
          </g>
        ))}
        {labels.map((l, i) => {
          const x0 = padL + i * band + (band - (barW + 2) * series.length + 2) / 2;
          return (
            <g key={l}>
              {series.map((s, k) => {
                const v = s.values[i], h = (v / top) * plotH, x = x0 + k * (barW + 2);
                // Column: 4px rounded data-end, square at the baseline.
                return v > 0 ? (
                  <path key={s.name} fill={s.color} opacity={hover === null || hover === i ? 1 : 0.45}
                    d={`M${x},${y(0)} V${y(v) + Math.min(4, h)} Q${x},${y(v)} ${x + Math.min(4, barW / 2)},${y(v)} H${x + barW - Math.min(4, barW / 2)} Q${x + barW},${y(v)} ${x + barW},${y(v) + Math.min(4, h)} V${y(0)} Z`} />
                ) : null;
              })}
              {i % 2 === labels.length % 2 && <text x={padL + i * band + band / 2} y={H - 6} textAnchor="middle" fontSize={10} fill="var(--color-text-muted)">{l}</text>}
              {/* Hit target: the whole band, bigger than the marks. */}
              <rect x={padL + i * band} y={padT} width={band} height={plotH} fill="transparent" tabIndex={0}
                aria-label={`${tooltipTitle(i)}: ${series.map((s) => `${s.name} ${s.values[i]}`).join(", ")}`}
                onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} />
            </g>
          );
        })}
      </svg>
      {hover !== null && (
        <div role="status" className="pointer-events-none absolute top-6 z-10 rounded-md border border-border bg-surface-raised px-3 py-2 text-xs shadow-pop"
          style={{ left: `${Math.min(75, ((padL + (hover + 0.5) * band) / W) * 100)}%` }}>
          <p className="mb-1 text-muted">{tooltipTitle(hover)}</p>
          {series.map((s) => (
            <p key={s.name} className="flex items-center gap-2">
              <span className="h-0.5 w-3" style={{ background: s.color }} aria-hidden="true" />
              <strong className="text-text">{s.values[hover]}</strong><span className="text-muted">{s.name}</span>
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
