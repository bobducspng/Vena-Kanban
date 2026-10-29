import PDFDocument from "pdfkit";
import { PDFDocument as PdfLib, StandardFonts, rgb } from "pdf-lib";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "./db/client.js";
import { attachments, cardAssignees, cards, organizations, pipes, signatureRequests, signatureSigners, users } from "./db/schema.js";
import { env } from "./env.js";
import { UPLOAD_DIR } from "./http/fileRoutes.js";
import { sendCardMail, sendMail } from "./mailer.js";
import { notifyOutside } from "./notify.js";
import { newToken } from "./publicForms.js";
import { saveCardFile } from "./pdf.js";
import { logEvent } from "./trpc/cardAccess.js";

/**
 * Assinatura eletrônica própria (M11), "assinatura eletrônica simples" (Lei 14.063/2020):
 * a PDF of the card goes by e-mail to each signer with a secret link; the signer reads
 * it, types their name (and CPF, optional) and confirms. We keep date/time, IP, browser
 * and the SHA-256 of the PDF as sent. When everybody has signed, the final PDF is the
 * original with a footer on every page plus a "Registro de assinaturas" page, attached
 * to the card and e-mailed to everyone.
 */

export const signUrl = (token: string) => `${env.PUBLIC_BASE_URL}/assinar/${token}`;
const sha256 = (b: Uint8Array) => createHash("sha256").update(b).digest("hex");
const filePath = (cardId: string, attachmentId: string) => join(UPLOAD_DIR, cardId, attachmentId);
const brt = (d: Date) => d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "medium" });
// Built-in PDF fonts are WinAnsi only (see pdf.ts).
const WIN_ANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const clean = (s: string) => [...s].filter((c) => (c.charCodeAt(0) >= 32 && c.charCodeAt(0) <= 255) || WIN_ANSI_EXTRA.includes(c)).join("");
/** Short code printed on the pages: the request id without dashes, in groups. */
export const verificationCode = (id: string) => id.replace(/-/g, "").slice(0, 16).toUpperCase().match(/.{4}/g)!.join("-");

async function inviteSigner(s: { name: string; email: string; token: string }, title: string, from: string, message: string | null) {
  return sendMail({
    to: s.email,
    subject: `Documento para assinar: ${title}`,
    heading: `Olá, ${s.name}`,
    paragraphs: [
      `${from} enviou o documento "${title}" para você assinar eletronicamente.`,
      ...(message ? [message] : []),
      "Abra o link, leia o documento e confirme a assinatura. O link é pessoal: não encaminhe este e-mail.",
    ],
    button: { label: "Ler e assinar", url: signUrl(s.token) },
  });
}

/** Send a PDF attachment of the card for signature. */
export async function createSignatureRequest(input: {
  cardId: string; attachmentId: string; signers: { name: string; email: string }[]; message?: string | null; userId: string;
}) {
  const att = (await db.select().from(attachments).where(and(eq(attachments.id, input.attachmentId), eq(attachments.cardId, input.cardId))).limit(1))[0];
  if (!att) throw new Error("anexo não encontrado neste card");
  if (att.mimeType !== "application/pdf" && !att.filename.toLowerCase().endsWith(".pdf")) throw new Error("só arquivos PDF podem ser assinados");
  const bytes = await readFile(filePath(input.cardId, att.id));
  await PdfLib.load(bytes, { ignoreEncryption: false }).catch(() => { throw new Error("o PDF está protegido ou corrompido"); });

  const id = crypto.randomUUID();
  const title = att.filename.replace(/\.pdf$/i, "");
  await db.insert(signatureRequests).values({ id, cardId: input.cardId, attachmentId: att.id, title, message: input.message || null, sha256: sha256(bytes), createdBy: input.userId });
  const signers = input.signers.map((s, i) => ({ id: crypto.randomUUID(), requestId: id, name: s.name.trim(), email: s.email.trim().toLowerCase(), token: newToken(), position: i }));
  await db.insert(signatureSigners).values(signers);
  const from = (await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, input.userId)).limit(1))[0];
  const sent = await Promise.all(signers.map((s) => inviteSigner(s, title, from?.name ?? from?.email ?? "Alguém", input.message ?? null)));
  await logEvent(input.cardId, "signature_requested", input.userId, { title, signers: signers.map((s) => s.email) });
  return { id, emailed: sent.filter(Boolean).length, total: signers.length };
}

export async function listForCard(cardId: string) {
  const reqs = await db.select().from(signatureRequests).where(eq(signatureRequests.cardId, cardId)).orderBy(asc(signatureRequests.createdAt));
  const signers = reqs.length
    ? await db.select().from(signatureSigners).where(inArray(signatureSigners.requestId, reqs.map((r) => r.id))).orderBy(asc(signatureSigners.position))
    : [];
  return reqs.map((r) => ({
    ...r, code: verificationCode(r.id),
    signers: signers.filter((s) => s.requestId === r.id).map(({ token: _t, ip: _i, userAgent: _u, ...s }) => s),
  }));
}

export async function cancelRequest(requestId: string) {
  await db.update(signatureRequests).set({ status: "cancelled" }).where(and(eq(signatureRequests.id, requestId), eq(signatureRequests.status, "pending")));
}

/** Send the link again (a signer lost the e-mail). */
export async function resendInvite(signerId: string) {
  const s = (await db.select().from(signatureSigners).where(eq(signatureSigners.id, signerId)).limit(1))[0];
  const r = s && (await db.select().from(signatureRequests).where(eq(signatureRequests.id, s.requestId)).limit(1))[0];
  if (!s || !r || r.status !== "pending" || s.signedAt) throw new Error("não há assinatura pendente para esta pessoa");
  if (!(await inviteSigner(s, r.title, "Lembrete:", r.message))) throw new Error("não foi possível enviar o e-mail");
}

/** What the public page shows for a signer link. */
export async function signerView(token: string) {
  const s = (await db.select().from(signatureSigners).where(eq(signatureSigners.token, token)).limit(1))[0];
  if (!s) return null;
  const r = (await db.select().from(signatureRequests).where(eq(signatureRequests.id, s.requestId)).limit(1))[0];
  if (!r) return null;
  if (!s.viewedAt && r.status === "pending") await db.update(signatureSigners).set({ viewedAt: new Date() }).where(eq(signatureSigners.id, s.id));
  const all = await db.select({ name: signatureSigners.name, signedAt: signatureSigners.signedAt }).from(signatureSigners).where(eq(signatureSigners.requestId, r.id)).orderBy(asc(signatureSigners.position));
  const org = (await db.select({ name: organizations.name }).from(organizations).innerJoin(pipes, eq(pipes.orgId, organizations.id)).innerJoin(cards, eq(cards.pipeId, pipes.id)).where(eq(cards.id, r.cardId)).limit(1))[0];
  return {
    signer: { name: s.name, email: s.email, signedAt: s.signedAt },
    request: { title: r.title, message: r.message, status: r.status, sha256: r.sha256, code: verificationCode(r.id), finalReady: !!r.signedAttachmentId },
    signers: all.map((x) => ({ name: x.name, signed: !!x.signedAt })),
    orgName: org?.name ?? "",
    _internal: { signerId: s.id, requestId: r.id, cardId: r.cardId, attachmentId: r.signedAttachmentId ?? r.attachmentId },
  };
}

/** Bytes of the document for a signer: the final one once everybody signed. */
export async function signerDocument(token: string) {
  const v = await signerView(token);
  if (!v || v.request.status === "cancelled") return null;
  const att = (await db.select().from(attachments).where(eq(attachments.id, v._internal.attachmentId)).limit(1))[0];
  return att ? { path: filePath(v._internal.cardId, att.id), filename: att.filename } : null;
}

/** Record a signature; when it is the last one, build and distribute the final PDF. */
export async function sign(token: string, input: { name: string; document?: string | null }, meta: { ip: string; userAgent: string }) {
  const v = await signerView(token);
  if (!v) throw new Error("Link inválido.");
  if (v.request.status === "cancelled") throw new Error("Este pedido de assinatura foi cancelado.");
  if (v.signer.signedAt) throw new Error("Você já assinou este documento.");
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();
  if (norm(input.name) !== norm(v.signer.name)) throw new Error(`Digite seu nome completo exatamente como abaixo: ${v.signer.name}`);
  // The file must still be the one that was sent.
  const original = (await db.select().from(signatureRequests).where(eq(signatureRequests.id, v._internal.requestId)).limit(1))[0];
  const bytes = await readFile(filePath(original.cardId, original.attachmentId));
  if (sha256(bytes) !== original.sha256) throw new Error("O documento foi alterado depois do envio. Peça um novo envio.");

  await db.update(signatureSigners)
    .set({ signedAt: new Date(), signedName: input.name.trim(), document: input.document?.replace(/\D/g, "") || null, ip: meta.ip.slice(0, 64), userAgent: meta.userAgent.slice(0, 512) })
    .where(and(eq(signatureSigners.id, v._internal.signerId), eq(signatureSigners.token, token)));
  await logEvent(original.cardId, "signature_signed", null, { title: original.title, name: v.signer.name, email: v.signer.email });

  const pending = (await db.select({ signedAt: signatureSigners.signedAt }).from(signatureSigners).where(eq(signatureSigners.requestId, original.id))).filter((s) => !s.signedAt);
  if (!pending.length) await finalize(original.id);
  return { completed: !pending.length };
}

async function finalize(requestId: string) {
  // Only one caller finalizes (two last signatures at the same time).
  const claimed = await db.update(signatureRequests).set({ status: "completed", completedAt: new Date() })
    .where(and(eq(signatureRequests.id, requestId), eq(signatureRequests.status, "pending")));
  if ((claimed as unknown as [{ affectedRows: number }])[0]?.affectedRows === 0) return;
  const r = (await db.select().from(signatureRequests).where(eq(signatureRequests.id, requestId)).limit(1))[0];
  const signers = await db.select().from(signatureSigners).where(eq(signatureSigners.requestId, requestId)).orderBy(asc(signatureSigners.position));
  const original = await readFile(filePath(r.cardId, r.attachmentId));
  const finalBytes = await buildSignedPdf(original, r, signers);
  const file = await saveCardFile(r.cardId, `${r.title} - assinado.pdf`, finalBytes, "application/pdf", null);
  await db.update(signatureRequests).set({ signedAttachmentId: file!.id }).where(eq(signatureRequests.id, requestId));
  await logEvent(r.cardId, "signature_completed", null, { title: r.title });

  // Everyone gets the signed copy; the card's people are told in the app.
  const creator = r.createdBy ? (await db.select({ email: users.email }).from(users).where(eq(users.id, r.createdBy)).limit(1))[0] : undefined;
  const to = [...new Set([...signers.map((s) => s.email), ...(creator ? [creator.email] : [])])];
  await sendCardMail({
    to, subject: `Documento assinado: ${r.title}`,
    body: `O documento "${r.title}" foi assinado por todos (${signers.map((s) => s.name).join(", ")}).\n\nA via assinada segue anexa. Código de verificação: ${verificationCode(r.id)}.`,
    attachments: [{ filename: file!.filename, path: filePath(r.cardId, file!.id), contentType: "application/pdf" }],
  }).catch((err) => console.error("signed copy e-mail failed:", err));
  const people = (await db.select({ userId: cardAssignees.userId }).from(cardAssignees).where(eq(cardAssignees.cardId, r.cardId))).map((a) => a.userId);
  await notifyOutside([...new Set([...people, ...(r.createdBy ? [r.createdBy] : [])])], r.cardId, "Documento assinado por todos", r.title);
}

type Req = typeof signatureRequests.$inferSelect;
type Signer = typeof signatureSigners.$inferSelect;

/** Original pages with a footer stamp + the "Registro de assinaturas" page(s). */
export async function buildSignedPdf(original: Uint8Array, r: Pick<Req, "id" | "title" | "sha256" | "completedAt">, signers: Signer[]): Promise<Buffer> {
  const out = await PdfLib.load(original);
  const font = await out.embedFont(StandardFonts.Helvetica);
  const code = verificationCode(r.id);
  const stamp = clean(`Assinado eletronicamente por ${signers.map((s) => s.name).join(", ")} · código ${code}`);
  for (const page of out.getPages()) {
    const { width } = page.getSize();
    let text = stamp, size = 7;
    while (font.widthOfTextAtSize(text, size) > width - 40 && text.length > 20) text = `${text.slice(0, -4)}…`;
    page.drawText(text, { x: 20, y: 10, size, font, color: rgb(0.34, 0.37, 0.42) });
  }
  const cert = await PdfLib.load(await certificate(r, signers));
  for (const p of await out.copyPages(cert, cert.getPageIndices())) out.addPage(p);
  out.setTitle(clean(`${r.title} - assinado`));
  out.setProducer("Venaflow");
  return Buffer.from(await out.save());
}

function certificate(r: Pick<Req, "id" | "title" | "sha256" | "completedAt">, signers: Signer[]): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 56, bottom: 56, left: 56, right: 56 } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((res) => doc.on("end", () => res(Buffer.concat(chunks))));
  const w = doc.page.width - 112;
  const INK = "#15181d", MUTED = "#565e6b", RULE = "#d5d9e0";
  doc.font("Helvetica-Bold").fontSize(16).fillColor(INK).text("Registro de assinaturas eletrônicas");
  doc.moveDown(0.4).font("Helvetica").fontSize(10).fillColor(MUTED)
    .text(clean(`Documento: ${r.title}`))
    .text(`Código de verificação: ${verificationCode(r.id)}`)
    .text(`Concluído em: ${r.completedAt ? brt(r.completedAt) : "—"} (horário de Brasília)`)
    .text(`SHA-256 do documento enviado: ${r.sha256}`, { width: w });
  doc.moveDown(0.8);
  for (const s of signers) {
    if (doc.y > doc.page.height - 180) doc.addPage();
    doc.moveTo(56, doc.y).lineTo(56 + w, doc.y).strokeColor(RULE).lineWidth(0.6).stroke().moveDown(0.6);
    doc.font("Helvetica-Bold").fontSize(11).fillColor(INK).text(clean(s.name), 56, doc.y, { width: w });
    doc.font("Helvetica").fontSize(9.5).fillColor(MUTED);
    const rows: [string, string][] = [
      ["E-mail", s.email],
      ["Nome digitado", s.signedName ?? "—"],
      ...(s.document ? [["CPF informado", s.document.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4")] as [string, string]] : []),
      ["Assinou em", s.signedAt ? `${brt(s.signedAt)} (Brasília)` : "—"],
      ["Endereço IP", s.ip ?? "—"],
      ["Navegador", s.userAgent ?? "—"],
    ];
    for (const [k, v] of rows) {
      const y = doc.y;
      doc.text(k, 56, y, { width: 110 });
      const h = doc.heightOfString(clean(v), { width: w - 120 });
      doc.text(clean(v), 176, y, { width: w - 120 });
      doc.y = y + Math.max(h, 12) + 2;
    }
    doc.moveDown(0.6);
  }
  doc.moveDown(0.6).fontSize(8.5).fillColor(MUTED).text(
    "Assinatura eletrônica simples (Lei nº 14.063/2020, art. 4º, I; MP nº 2.200-2/2001, art. 10, § 2º). Cada signatário foi identificado pelo link pessoal enviado ao seu e-mail, " +
    "confirmou ter lido o documento e digitou o próprio nome. O SHA-256 acima identifica o documento original: qualquer alteração no arquivo muda esse código.",
    56, doc.y, { width: w },
  );
  doc.end();
  return done;
}
