import { useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Download, FileSpreadsheet } from "lucide-react";
import { api } from "../../data/store";
import { Button } from "../ui/Button";
import { Modal } from "../ui/Modal";
import { Select } from "../ui/Select";
import { useToast } from "../ui/Toast";

/**
 * Importar planilha (.xlsx ou .csv) para cards de um pipe ou registros de um banco de dados.
 * 1. arquivo → 2. cada coluna vira um campo (adivinhado pelo nome) → 3. Conferir (nada é
 * gravado; mostra os erros por linha) → 4. Importar (só as linhas sem erro).
 */

type Target = { kind: "pipe"; pipeId: string; hasTitleField: boolean } | { kind: "table"; tableId: string };
type Cell = string | number | boolean | null;
type Result = { row: number; ok: boolean; error?: string; number?: number };

const MAX_ROWS = 5000, BATCH = 100;
const TITLE = "__title", PHASE = "__phase", IGNORE = "__ignore";
const SKIP_TYPES = new Set(["attachment", "id", "statement", "formula"]);
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
const pad = (n: number) => String(n).padStart(2, "0");

/** Excel dates arrive as Date (UTC): keep the day, and the time when there is one. */
function cell(v: unknown): Cell {
  if (v === null || v === undefined) return null;
  if (v instanceof Date) {
    const day = `${v.getUTCFullYear()}-${pad(v.getUTCMonth() + 1)}-${pad(v.getUTCDate())}`;
    return v.getUTCHours() || v.getUTCMinutes() ? `${day}T${pad(v.getUTCHours())}:${pad(v.getUTCMinutes())}` : day;
  }
  return typeof v === "string" || typeof v === "number" || typeof v === "boolean" ? v : String(v);
}

/** CSV saved by Excel in Brazil is often Windows-1252, not UTF-8. */
async function readCsv(file: File): Promise<Cell[][]> {
  const buf = await file.arrayBuffer();
  let text: string;
  try { text = new TextDecoder("utf-8", { fatal: true }).decode(buf); } catch { text = new TextDecoder("windows-1252").decode(buf); }
  const Papa = (await import("papaparse")).default;
  return Papa.parse<string[]>(text.replace(/^﻿/, ""), { skipEmptyLines: "greedy" }).data.map((r) => r.map((c) => (c === "" ? null : c)));
}

async function readXlsx(file: File): Promise<{ name: string; rows: Cell[][] }[]> {
  const readXlsxFile = (await import("read-excel-file/browser")).default;
  const sheets = await readXlsxFile(file);
  return sheets.map((s) => ({ name: s.sheet, rows: s.data.map((r) => r.map(cell)) }));
}

export function ImportModal({ open, onClose, target, title }: { open: boolean; onClose: () => void; target: Target; title: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [sheets, setSheets] = useState<{ name: string; rows: Cell[][] }[] | null>(null);
  const [sheetIdx, setSheetIdx] = useState(0);
  const [fileName, setFileName] = useState("");
  const [mapping, setMapping] = useState<string[]>([]);
  const [runAutomations, setRunAutomations] = useState(false);
  const [busy, setBusy] = useState<"" | "check" | "import">("");
  const [progress, setProgress] = useState(0);
  const [check, setCheck] = useState<Result[] | null>(null);
  const [done, setDone] = useState<Result[] | null>(null);

  const pipeId = target.kind === "pipe" ? target.pipeId : "";
  const tableId = target.kind === "table" ? target.tableId : "";
  const { data: pipeFields } = useQuery({ queryKey: ["fields", pipeId], queryFn: () => api.field.listByPipe(pipeId), enabled: open && !!pipeId });
  const { data: phases } = useQuery({ queryKey: ["phases", pipeId], queryFn: () => api.phase.listByPipe(pipeId), enabled: open && !!pipeId });
  const { data: columns } = useQuery({ queryKey: ["columns", tableId], queryFn: () => api.database.columns(tableId), enabled: open && !!tableId });

  // What a column can become: card title / phase (pipes) and each importable field.
  const options = useMemo(() => {
    const phaseName = new Map((phases ?? []).map((p) => [p.id, p.name]));
    const fs = target.kind === "pipe"
      ? (pipeFields ?? []).filter((f) => !f.archivedAt && !SKIP_TYPES.has(f.type)).map((f) => ({ value: f.id, label: `${f.label} (${phaseName.get(f.phaseId) ?? "fase"})`, name: f.label }))
      : (columns ?? []).filter((c) => !c.archivedAt && !SKIP_TYPES.has(c.type)).map((c) => ({ value: c.id, label: c.label, name: c.label }));
    const special = target.kind === "pipe"
      ? [...(!target.hasTitleField ? [{ value: TITLE, label: "→ Título do card", name: "título" }] : []), { value: PHASE, label: "→ Fase do card (nome da fase)", name: "fase" }]
      : [];
    return [{ value: IGNORE, label: "Não importar", name: "" }, ...special, ...fs];
  }, [target, pipeFields, phases, columns]);

  const rows = sheets?.[sheetIdx]?.rows ?? [];
  const header = (rows[0] ?? []).map((h, i) => (h === null || h === "" ? `Coluna ${i + 1}` : String(h)));
  const body = rows.slice(1, MAX_ROWS + 1);

  const guess = (hdr: string[]) => hdr.map((h) => {
    const n = norm(h);
    if (target.kind === "pipe" && !target.hasTitleField && ["titulo", "title", "nome do card", "titulo do card"].includes(n)) return TITLE;
    if (target.kind === "pipe" && ["fase", "fase atual", "current phase", "phase"].includes(n)) return PHASE;
    return options.find((o) => o.name && norm(o.name) === n)?.value ?? IGNORE;
  });

  const pick = async (file: File) => {
    setCheck(null); setDone(null); setFileName(file.name); setSheetIdx(0);
    try {
      const list = /\.csv$/i.test(file.name) ? [{ name: "CSV", rows: await readCsv(file) }] : await readXlsx(file);
      if (!list.length || !list[0].rows.length) throw new Error("A planilha está vazia.");
      setSheets(list);
      setMapping(guess((list[0].rows[0] ?? []).map((h, i) => (h === null ? `Coluna ${i + 1}` : String(h)))));
    } catch (e) {
      setSheets(null);
      toast(/\.xls$/i.test(file.name) ? "Arquivos .xls antigos não são lidos: no Excel, salve como .xlsx ou .csv." : `Não foi possível ler o arquivo: ${e instanceof Error ? e.message : e}`, "error");
    }
  };

  const send = async (dryRun: boolean) => {
    const results: Result[] = [];
    const m = mapping.map((v) => (v === IGNORE ? null : v));
    for (let i = 0; i < body.length; i += BATCH) {
      const chunk = body.slice(i, i + BATCH);
      const base = { mapping: m, rows: chunk, firstRow: i + 2, dryRun };
      results.push(...(target.kind === "pipe"
        ? await api.importer.cards({ pipeId, runAutomations, ...base })
        : await api.importer.records({ tableId, ...base })));
      setProgress(Math.min(100, Math.round(((i + chunk.length) / body.length) * 100)));
    }
    return results;
  };

  const run = async (dryRun: boolean) => {
    setBusy(dryRun ? "check" : "import"); setProgress(0);
    try {
      const r = await send(dryRun);
      if (dryRun) setCheck(r);
      else {
        setDone(r);
        qc.invalidateQueries();
        toast(`${r.filter((x) => x.ok).length} linha(s) importada(s)`, "success");
      }
    } catch (e) {
      toast(e instanceof Error ? e.message : "Falha na importação", "error");
    } finally { setBusy(""); }
  };

  const errorsCsv = (list: Result[]) => {
    const lines = ["Linha;Erro", ...list.filter((r) => !r.ok).map((r) => `${r.row};"${(r.error ?? "").replace(/"/g, '""')}"`)];
    const url = URL.createObjectURL(new Blob(["﻿" + lines.join("\r\n")], { type: "text/csv;charset=utf-8" }));
    Object.assign(document.createElement("a"), { href: url, download: "erros-da-importacao.csv" }).click();
    URL.revokeObjectURL(url);
  };

  const reset = () => { setSheets(null); setFileName(""); setCheck(null); setDone(null); setMapping([]); };
  const close = () => { reset(); onClose(); };
  const needsTitle = target.kind === "pipe" && !target.hasTitleField && !mapping.includes(TITLE);
  const okCount = check?.filter((r) => r.ok).length ?? 0;
  const bad = (check ?? []).filter((r) => !r.ok);

  return (
    <Modal open={open} onOpenChange={(o) => !o && close()} title={`Importar planilha · ${title}`} size="wide"
      footer={done ? <Button onClick={close}>Fechar</Button> : (
        <>
          <Button variant="secondary" onClick={close}>Cancelar</Button>
          {sheets && <Button variant="secondary" loading={busy === "check"} disabled={!!busy || needsTitle || !body.length} onClick={() => run(true)}>Conferir</Button>}
          {check && <Button loading={busy === "import"} disabled={!!busy || !okCount} onClick={() => run(false)}>Importar {okCount} linha(s)</Button>}
        </>
      )}>
      <div className="flex flex-col gap-4">
        {done ? (
          <div className="flex flex-col gap-2">
            <p className="inline-flex items-center gap-2 text-sm text-success"><CheckCircle2 className="h-5 w-5" aria-hidden="true" /> {done.filter((r) => r.ok).length} linha(s) importada(s).</p>
            {done.some((r) => !r.ok) && (
              <p className="text-sm text-danger">{done.filter((r) => !r.ok).length} linha(s) não entraram. <button className="text-accent underline" onClick={() => errorsCsv(done)}>Baixar a lista de erros</button></p>
            )}
          </div>
        ) : !sheets ? (
          <label className="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed border-border-input p-8 text-center hover:border-accent">
            <FileSpreadsheet className="h-8 w-8 text-muted" aria-hidden="true" />
            <span className="text-sm font-medium text-text">Escolher arquivo .xlsx ou .csv</span>
            <span className="text-xs text-muted">A primeira linha deve ter os nomes das colunas. Até {MAX_ROWS.toLocaleString("pt-BR")} linhas por vez. {fileName}</span>
            <input type="file" accept=".xlsx,.csv,.xls" hidden onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) void pick(f); }} />
          </label>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3 text-sm text-text">
              <span><strong>{fileName}</strong> · {body.length} linha(s){rows.length - 1 > MAX_ROWS ? ` (só as primeiras ${MAX_ROWS})` : ""}</span>
              {sheets.length > 1 && (
                <div className="w-48"><Select aria-label="Aba da planilha" value={String(sheetIdx)} options={sheets.map((s, i) => ({ value: String(i), label: `Aba: ${s.name}` }))}
                  onValueChange={(v) => { setSheetIdx(+v); setCheck(null); setMapping(guess((sheets[+v].rows[0] ?? []).map((h, i) => (h === null ? `Coluna ${i + 1}` : String(h))))); }} /></div>
              )}
              <button className="text-xs text-accent" onClick={reset}>trocar arquivo</button>
            </div>

            <div className="max-h-72 overflow-auto rounded-md border border-border">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-surface text-left text-xs text-muted">
                  <tr><th className="px-3 py-2">Coluna da planilha</th><th className="px-3 py-2">Exemplo</th><th className="px-3 py-2">Vai para</th></tr>
                </thead>
                <tbody>
                  {header.map((h, i) => (
                    <tr key={i} className="border-t border-border">
                      <td className="px-3 py-1.5 text-text">{h}</td>
                      <td className="max-w-48 truncate px-3 py-1.5 text-muted">{String(body.find((r) => r[i] !== null && r[i] !== undefined)?.[i] ?? "")}</td>
                      <td className="w-72 px-3 py-1"><Select aria-label={`Destino da coluna ${h}`} value={mapping[i] ?? IGNORE} options={options}
                        onValueChange={(v) => { setCheck(null); setMapping((m) => m.map((x, j) => (j === i ? v : x))); }} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {needsTitle && <p className="text-xs text-warning">Escolha a coluna que vira o <strong>Título do card</strong>.</p>}
            <p className="text-xs text-muted">
              Datas como 29/10/2026 · números como 1.234,56 · Sim/Não · opções pelo nome · responsáveis pelo e-mail · itens conectados pelo título
              {target.kind === "pipe" ? " (ou #número do card)" : ""} · vários valores separados por ponto e vírgula.
            </p>
            {target.kind === "pipe" && (
              <label className="inline-flex items-start gap-2 text-sm text-text">
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-accent" checked={runAutomations} onChange={(e) => setRunAutomations(e.target.checked)} />
                <span>Rodar as automações do pipe para os cards importados <span className="block text-xs text-muted">Deixe desmarcado para migrar dados antigos sem disparar e-mails e outras ações.</span></span>
              </label>
            )}

            {busy && <div className="h-2 overflow-hidden rounded-pill bg-surface" role="progressbar" aria-valuenow={progress}><div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} /></div>}

            {check && (
              <div className="flex flex-col gap-2 rounded-md border border-border p-3">
                <p className="text-sm text-text"><strong>{okCount}</strong> linha(s) prontas para importar{bad.length ? <>, <strong className="text-danger">{bad.length}</strong> com erro (ficam de fora)</> : ""}.</p>
                {bad.length > 0 && (
                  <>
                    <ul className="max-h-40 overflow-auto text-xs text-danger">
                      {bad.slice(0, 200).map((r) => <li key={r.row}>Linha {r.row}: {r.error}</li>)}
                    </ul>
                    <Button size="sm" variant="ghost" className="self-start" onClick={() => errorsCsv(check)}><Download className="h-4 w-4" aria-hidden="true" /> Baixar erros</Button>
                    <p className="text-xs text-muted">Dá para corrigir a planilha e escolher o arquivo de novo, ou importar só as linhas certas agora.</p>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
