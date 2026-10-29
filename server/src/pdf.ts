import PDFDocument from "pdfkit";
import { join } from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { db } from "./db/client.js";
import { attachments, cards, organizations, pdfTemplates, pipes } from "./db/schema.js";
import { cardContext, type CardContext } from "./templates.js";
import { UPLOAD_DIR } from "./http/fileRoutes.js";
import { logEvent } from "./trpc/cardAccess.js";

/**
 * Gerador de PDF (M11). A modelo is plain text with the e-mail placeholders
 * ({Nome do campo}, {#}, {Título}, {Fase}…) plus a little markup, one per line:
 *   # Título grande      ## Subtítulo      - item de lista      ---  (linha)
 *   **negrito** inside any line      {Todos os campos}  (table of every filled field)
 * Blank lines separate paragraphs.
 */

export const DEFAULT_BODY = "# {Título}\nCard #{#} · {Pipe} · fase {Fase}\n\n{Todos os campos}";
const ALL_FIELDS = /^\{\s*todos os campos\s*\}$/i;

// The built-in PDF fonts only have Latin characters (WinAnsi): accents and ç are
// fine; emojis and other scripts would print as garbage, so they are dropped.
const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const clean = (s: string) => [...s].filter((c) => c === "\n" || (c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 255) || WIN_ANSI_EXTRA.includes(c)).join("");

const INK = "#15181d", MUTED = "#565e6b", RULE = "#d5d9e0";
const nowBR = () => new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });

/** Text with **negrito** runs. */
function rich(doc: PDFKit.PDFDocument, line: string, size: number, opts: PDFKit.Mixins.TextOptions = {}) {
  const parts = clean(line).split("**");
  doc.fontSize(size).fillColor(INK);
  parts.forEach((p, i) => {
    doc.font(i % 2 ? "Helvetica-Bold" : "Helvetica").text(p, { ...opts, continued: i < parts.length - 1 });
  });
}

/** Render a card into a PDF buffer with the given body (null = default summary). */
export async function renderCardPdf(cardId: string, body: string | null): Promise<Buffer> {
  const ctx = await cardContext(cardId);
  const card = (await db.select({ pipeId: cards.pipeId }).from(cards).where(eq(cards.id, cardId)).limit(1))[0];
  const pipe = card ? (await db.select({ orgId: pipes.orgId }).from(pipes).where(eq(pipes.id, card.pipeId)).limit(1))[0] : undefined;
  const org = pipe ? (await db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, pipe.orgId)).limit(1))[0] : undefined;
  return buildPdf(ctx, org?.name ?? "Venaflow", body);
}

/** The layout itself (no database): testable on its own. */
export function buildPdf(ctx: Pick<CardContext, "fill" | "entries" | "card">, orgName: string, body: string | null): Promise<Buffer> {

  const doc = new PDFDocument({ size: "A4", margins: { top: 64, bottom: 64, left: 56, right: 56 }, bufferPages: true, info: { Title: clean(ctx.card.title), Creator: "Venaflow" } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  const width = doc.page.width - 112;

  const lines = (body ?? DEFAULT_BODY).replace(/\r/g, "").split("\n");
  let para: string[] = [];
  let inList = false;
  const flush = () => {
    if (inList) { doc.moveDown(0.4); inList = false; }
    if (!para.length) return;
    // One text call per line: a "continued" bold run must not cross a line break.
    for (const l of para) rich(doc, ctx.fill(l), 10.5, { lineGap: 2 });
    doc.moveDown(0.6);
    para = [];
  };
  for (const raw of lines) {
    const line = raw.trimEnd();
    if (ALL_FIELDS.test(line.trim())) { flush(); fieldTable(doc, ctx.entries(), width); continue; }
    if (!line.trim()) { flush(); continue; }
    if (line.startsWith("# ")) { flush(); rich(doc, ctx.fill(line.slice(2)), 18); doc.moveDown(0.4); continue; }
    if (line.startsWith("## ")) { flush(); doc.moveDown(0.3); rich(doc, ctx.fill(line.slice(3)), 13); doc.moveDown(0.3); continue; }
    if (/^-{3,}$/.test(line.trim())) {
      flush();
      doc.moveDown(0.3).moveTo(56, doc.y).lineTo(56 + width, doc.y).strokeColor(RULE).lineWidth(0.8).stroke().moveDown(0.6);
      continue;
    }
    if (line.startsWith("- ")) {
      if (!inList) flush();
      inList = true;
      rich(doc, `•  ${ctx.fill(line.slice(2))}`, 10.5, { indent: 8, lineGap: 2 });
      continue;
    }
    if (inList) flush();
    para.push(line);
  }
  flush();

  // Header and footer on every page.
  const range = doc.bufferedPageRange();
  for (let i = 0; i < range.count; i++) {
    doc.switchToPage(range.start + i);
    const bottom = doc.page.margins.bottom;
    doc.page.margins.bottom = 0; // writing inside the margin must not open a new page
    doc.font("Helvetica").fontSize(8).fillColor(MUTED);
    doc.text(clean(orgName), 56, 32, { width: width / 2, lineBreak: false });
    doc.text(`Card #${ctx.card.number}`, 56 + width / 2, 32, { width: width / 2, align: "right", lineBreak: false });
    doc.text(`Gerado pelo Venaflow em ${nowBR()} · página ${i + 1} de ${range.count}`, 56, doc.page.height - 40, { width, align: "center", lineBreak: false });
    doc.page.margins.bottom = bottom;
  }
  doc.end();
  return done;
}

/** Every filled field: phase titles, then label / value rows. */
function fieldTable(doc: PDFKit.PDFDocument, rows: { phase: string; label: string; value: string }[], width: number) {
  const labelW = Math.round(width * 0.36);
  let phase = "";
  for (const r of rows) {
    if (r.phase !== phase) {
      phase = r.phase;
      doc.moveDown(0.5).font("Helvetica-Bold").fontSize(9).fillColor(MUTED).text(clean(phase.toUpperCase()), 56, doc.y, { width });
      doc.moveDown(0.2);
    }
    const label = clean(r.label), value = clean(r.value);
    doc.font("Helvetica").fontSize(10);
    const h = Math.max(doc.heightOfString(label, { width: labelW - 8 }), doc.heightOfString(value, { width: width - labelW }));
    if (doc.y + h + 8 > doc.page.height - doc.page.margins.bottom) doc.addPage();
    const y = doc.y;
    doc.fillColor(MUTED).text(label, 56, y, { width: labelW - 8 });
    doc.fillColor(INK).text(value, 56 + labelW, y, { width: width - labelW });
    doc.y = y + h + 4;
    doc.moveTo(56, doc.y).lineTo(56 + width, doc.y).strokeColor(RULE).lineWidth(0.5).stroke();
    doc.y += 4;
  }
  doc.x = 56;
  doc.moveDown(0.6);
}

/** Save bytes as a card attachment (same place and table as uploads). */
export async function saveCardFile(cardId: string, filename: string, bytes: Buffer, mimeType: string, userId: string | null, fieldId: string | null = null) {
  const id = crypto.randomUUID();
  const dir = join(UPLOAD_DIR, cardId);
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, id), bytes);
  await db.insert(attachments).values({ id, cardId, cardFieldId: fieldId, filename, url: `files/${id}`, sizeBytes: bytes.length, mimeType, uploadedBy: userId });
  await logEvent(cardId, "attachment_added", userId, { attachmentId: id, filename });
  return (await db.select().from(attachments).where(eq(attachments.id, id)).limit(1))[0];
}

/** Generate a modelo (or the default summary) for a card and keep it as an attachment. */
export async function generateCardPdf(cardId: string, templateId: string | null, userId: string | null) {
  const tpl = templateId ? (await db.select().from(pdfTemplates).where(eq(pdfTemplates.id, templateId)).limit(1))[0] : null;
  if (templateId && !tpl) throw new Error("modelo de PDF não encontrado");
  const bytes = await renderCardPdf(cardId, tpl?.body ?? null);
  const number = (await db.select({ number: cards.number }).from(cards).where(eq(cards.id, cardId)).limit(1))[0]?.number;
  const base = clean(tpl?.name ?? "Resumo do card").replace(/[\\/:*?"<>|\n]+/g, "_").slice(0, 200);
  return saveCardFile(cardId, `${base} #${number}.pdf`, bytes, "application/pdf", userId);
}
