/**
 * "Ajustar para celular": rewrites a pasted HTML e-mail following the usual rules of
 * responsive e-mail (works in Gmail, Outlook and phones):
 *   - viewport + charset in <head>;
 *   - content inside a centered column of at most 600px that shrinks on phones;
 *   - images fluid (max-width 100%, height auto) and never wider than 600px;
 *   - fixed widths above 600px (attribute or inline style) become 100% with a max-width;
 *   - rows with side-by-side columns get a class that stacks them on phones (media query).
 * Pure DOM: receives a DOMParser-like parser so it can be tested outside the browser.
 */

export interface ResponsiveReport { viewport: boolean; wrapped: boolean; images: number; widths: number; stacked: number }

const MAX = 600;
const STYLE_ID = "venaflow-responsive";
const MEDIA = `
/* Venaflow: ajuste para celular */
img { max-width: 100% !important; height: auto !important; }
@media only screen and (max-width: 620px) {
  .vf-wrap { width: 100% !important; }
  .vf-col { display: block !important; width: 100% !important; max-width: 100% !important; box-sizing: border-box; }
  .vf-fluid { width: 100% !important; max-width: 100% !important; }
}`;

const px = (v: string | null | undefined) => { const m = /^\s*(\d+(?:\.\d+)?)\s*(px)?\s*$/i.exec(v ?? ""); return m ? Number(m[1]) : null; };
const styleWidth = (el: Element) => px(/(?:^|;)\s*width\s*:\s*([^;]+)/i.exec(el.getAttribute("style") ?? "")?.[1]);
function setStyle(el: Element, prop: string, value: string) {
  const rest = (el.getAttribute("style") ?? "").split(";").map((s) => s.trim()).filter((s) => s && !new RegExp(`^${prop}\\s*:`, "i").test(s));
  el.setAttribute("style", [...rest, `${prop}: ${value}`].join("; "));
}
const addClass = (el: Element, c: string) => { const cur = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean); if (!cur.includes(c)) el.setAttribute("class", [...cur, c].join(" ")); };

/** Is the body already inside one narrow (≤ 700px) centered container? */
function alreadyWrapped(body: Element) {
  const kids = [...body.children].filter((k) => !["SCRIPT", "STYLE"].includes(k.tagName));
  if (kids.length !== 1) return false;
  let el: Element | undefined = kids[0];
  for (let depth = 0; el && depth < 4; depth++) {
    const w = px(el.getAttribute("width")) ?? styleWidth(el) ?? px(/max-width\s*:\s*([^;]+)/i.exec(el.getAttribute("style") ?? "")?.[1]);
    if (w && w <= 700) return true;
    el = el.querySelector("table, div") ?? undefined;
  }
  return false;
}

export function makeResponsive(html: string, parse: (html: string) => Document): { html: string; report: ResponsiveReport } {
  const doc = parse(/<html[\s>]/i.test(html) ? html : `<!DOCTYPE html><html><head></head><body>${html}</body></html>`);
  const head = doc.head ?? doc.documentElement.insertBefore(doc.createElement("head"), doc.body);
  const report: ResponsiveReport = { viewport: false, wrapped: false, images: 0, widths: 0, stacked: 0 };

  if (!head.querySelector('meta[charset], meta[http-equiv="Content-Type" i]')) {
    const m = doc.createElement("meta"); m.setAttribute("charset", "utf-8"); head.insertBefore(m, head.firstChild);
  }
  if (!head.querySelector('meta[name="viewport" i]')) {
    const m = doc.createElement("meta"); m.setAttribute("name", "viewport"); m.setAttribute("content", "width=device-width, initial-scale=1");
    head.appendChild(m); report.viewport = true;
  }

  // Fixed widths wider than the column → fluid with a max-width.
  for (const el of [...doc.body.querySelectorAll("table, td, th, div, img")]) {
    const attr = px(el.getAttribute("width")), inline = styleWidth(el);
    const w = attr ?? inline;
    if (el.tagName === "IMG") {
      const before = el.getAttribute("style") ?? "";
      const tooWide = (attr && attr > MAX) || (inline && inline > MAX);
      if (attr && attr > MAX) { el.setAttribute("width", String(MAX)); el.removeAttribute("height"); }
      setStyle(el, "max-width", "100%"); setStyle(el, "height", "auto");
      if (inline && inline > MAX) setStyle(el, "width", "100%");
      if (tooWide || !/max-width/i.test(before)) report.images++;
      continue;
    }
    if (w && w > MAX) {
      if (attr) el.setAttribute("width", "100%");
      setStyle(el, "width", "100%");
      setStyle(el, "max-width", `${MAX}px`);
      addClass(el, "vf-fluid");
      report.widths++;
    }
  }

  // Side-by-side columns: rows with 2–4 cells that carry content stack on phones.
  for (const tr of [...doc.body.querySelectorAll("tr")]) {
    const cells = [...tr.children].filter((c) => c.tagName === "TD" || c.tagName === "TH");
    if (cells.length < 2 || cells.length > 4) continue;
    const filled = cells.filter((c) => c.querySelector("img, table") || (c.textContent ?? "").trim().length > 20);
    if (filled.length < 2) continue;
    if (cells.every((c) => (c.getAttribute("class") ?? "").includes("vf-col"))) continue;
    for (const c of cells) addClass(c, "vf-col");
    report.stacked++;
  }

  // One centered column of at most 600px.
  if (!alreadyWrapped(doc.body)) {
    const outer = doc.createElement("table");
    outer.setAttribute("role", "presentation"); outer.setAttribute("width", "100%"); outer.setAttribute("cellpadding", "0"); outer.setAttribute("cellspacing", "0"); outer.setAttribute("border", "0");
    const tr = doc.createElement("tr"), td = doc.createElement("td");
    td.setAttribute("align", "center");
    const inner = doc.createElement("table");
    inner.setAttribute("role", "presentation"); inner.setAttribute("width", String(MAX)); inner.setAttribute("cellpadding", "0"); inner.setAttribute("cellspacing", "0"); inner.setAttribute("border", "0");
    inner.setAttribute("class", "vf-wrap"); inner.setAttribute("style", `width: 100%; max-width: ${MAX}px; margin: 0 auto`);
    const itr = doc.createElement("tr"), itd = doc.createElement("td");
    while (doc.body.firstChild) itd.appendChild(doc.body.firstChild);
    itr.appendChild(itd); inner.appendChild(itr); td.appendChild(inner); tr.appendChild(td); outer.appendChild(tr);
    doc.body.appendChild(outer);
    report.wrapped = true;
  }
  setStyle(doc.body, "margin", "0"); setStyle(doc.body, "padding", "0");

  let style = head.querySelector(`style#${STYLE_ID}`);
  if (!style) { style = doc.createElement("style"); style.setAttribute("id", STYLE_ID); head.appendChild(style); }
  style.textContent = MEDIA;

  const out = doc.documentElement.outerHTML;
  return { html: `<!DOCTYPE html>\n${out}`, report };
}

/** One line for the person: what changed. */
export function describeReport(r: ResponsiveReport) {
  const parts = [
    r.viewport && "ajuste de tela para celular",
    r.wrapped && "conteúdo centralizado em até 600px",
    r.images && `${r.images} imagem(ns) flexível(is)`,
    r.widths && `${r.widths} largura(s) fixa(s) trocada(s)`,
    r.stacked && `${r.stacked} linha(s) com colunas que empilham no celular`,
  ].filter(Boolean);
  return parts.length ? `Ajustado: ${parts.join(", ")}.` : "O HTML já estava no formato responsivo.";
}
