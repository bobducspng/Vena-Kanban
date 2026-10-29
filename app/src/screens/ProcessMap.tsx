import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../data/store";
import { AppShell } from "../components/app/AppShell";
import { Spinner } from "../components/ui/Spinner";

const W = 184, H = 44, GAP = 36, PIPE_Y = 120, TABLE_Y = 330;
const short = (s: string, n = 22) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Mapa de processos: pipes (top row) and bancos de dados (bottom row), linked by the
 *  connection fields between them. Click a box to open it. A text list repeats the links. */
export function ProcessMap() {
  const navigate = useNavigate();
  const { data, isLoading } = useQuery({ queryKey: ["processMap"], queryFn: api.org.map });

  if (isLoading || !data) return <AppShell title="Mapa de processos"><div className="p-6"><Spinner className="h-5 w-5" label="Carregando" /></div></AppShell>;
  const cols = Math.max(data.pipes.length, data.tables.length, 1);
  const width = cols * (W + GAP) + GAP;
  const x = (i: number, n: number) => GAP + i * (W + GAP) + ((cols - n) * (W + GAP)) / 2;
  const pos = new Map<string, { x: number; y: number; name: string }>([
    ...data.pipes.map((p, i) => [p.id, { x: x(i, data.pipes.length), y: PIPE_Y, name: p.name }] as const),
    ...data.tables.map((t, i) => [t.id, { x: x(i, data.tables.length), y: TABLE_Y, name: t.name }] as const),
  ]);

  const path = (from: string, to: string) => {
    const a = pos.get(from)!, b = pos.get(to)!;
    if (b.y === TABLE_Y) return `M ${a.x + W / 2} ${a.y + H} C ${a.x + W / 2} ${a.y + H + 80}, ${b.x + W / 2} ${b.y - 80}, ${b.x + W / 2} ${b.y}`;
    // Pipe to pipe: an arc above the row (higher for farther pipes).
    const lift = 30 + Math.abs(b.x - a.x) * 0.18;
    const ax = a.x + W / 2 + (b.x > a.x ? 20 : -20), bx = b.x + W / 2 + (b.x > a.x ? -20 : 20);
    if (from === to) return `M ${a.x + W - 30} ${a.y} C ${a.x + W - 30} ${a.y - 50}, ${a.x + W + 30} ${a.y - 50}, ${a.x + W} ${a.y + 10}`;
    return `M ${ax} ${a.y} C ${ax} ${a.y - lift}, ${bx} ${b.y - lift}, ${bx} ${b.y}`;
  };

  return (
    <AppShell title="Mapa de processos">
      <div className="flex flex-col gap-4 p-6">
        <div>
          <h2 className="text-xl text-text">Mapa de processos</h2>
          <p className="text-sm text-muted">Como os pipes e os bancos de dados se ligam pelos campos de conexão. Clique numa caixa para abrir.</p>
        </div>
        {!data.pipes.length ? <p className="text-sm text-muted">Nenhum pipe para mostrar.</p> : (
          <div className="overflow-x-auto rounded-lg border border-border bg-surface">
            <svg role="img" aria-label="Mapa de processos" width={width} height={TABLE_Y + H + 40} className="block text-muted">
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                  <path d="M 0 0 L 10 5 L 0 10 z" fill="currentColor" />
                </marker>
              </defs>
              <text x={GAP} y={PIPE_Y - 70} className="fill-current text-[11px] font-semibold uppercase">Pipes</text>
              {data.tables.length > 0 && <text x={GAP} y={TABLE_Y - 14} className="fill-current text-[11px] font-semibold uppercase">Bancos de dados</text>}
              {data.edges.map((e, i) => (
                <path key={i} d={path(e.from, e.to)} fill="none" stroke="currentColor" strokeWidth={1.5} markerEnd="url(#arrow)">
                  <title>{`${pos.get(e.from)?.name} → ${pos.get(e.to)?.name} (campo "${e.label}")`}</title>
                </path>
              ))}
              {[...data.pipes.map((p) => ({ ...p, kind: "pipe" as const })), ...data.tables.map((t) => ({ ...t, kind: "table" as const }))].map((n) => {
                const p = pos.get(n.id)!;
                const go = () => navigate(n.kind === "pipe" ? `/pipes/${n.id}/flow` : `/databases/${n.id}`);
                return (
                  <g key={n.id} role="link" tabIndex={0} aria-label={`${n.kind === "pipe" ? "Pipe" : "Banco de dados"} ${n.name}`} className="cursor-pointer"
                    onClick={go} onKeyDown={(e) => { if (e.key === "Enter") go(); }}>
                    <rect x={p.x} y={p.y} width={W} height={H} rx={8} className={n.kind === "pipe" ? "fill-bg stroke-accent" : "fill-bg stroke-border-input"} strokeWidth={1.5} />
                    <text x={p.x + 12} y={p.y + H / 2 + 4} className="fill-text text-[13px]">{n.icon ? `${n.icon} ` : ""}{short(n.name)}</text>
                    <title>{n.name}</title>
                  </g>
                );
              })}
            </svg>
          </div>
        )}
        <section aria-label="Ligações">
          <h3 className="mb-1 text-sm font-semibold text-text">Ligações ({data.edges.length})</h3>
          {data.edges.length ? (
            <ul className="flex flex-col gap-0.5 text-sm text-text">
              {data.edges.map((e, i) => (
                <li key={i}>{pos.get(e.from)?.name} → {pos.get(e.to)?.name} <span className="text-muted">({e.kind === "table" ? "conexão de banco de dados" : "conexão de pipe"}, campo "{e.label}")</span></li>
              ))}
            </ul>
          ) : <p className="text-sm text-muted">Nenhum campo de conexão ainda. Crie um em Configurar pipe → Novo campo → Campos de conexão.</p>}
        </section>
      </div>
    </AppShell>
  );
}
