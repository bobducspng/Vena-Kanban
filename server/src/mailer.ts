import nodemailer from "nodemailer";
import { env } from "./env.js";

/** Outgoing e-mail over SMTP (SMTP_* in server/.env). Not configured = log and skip. */

const configured = !!(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
const transport = configured
  ? nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465, // 465 = TLS from the start; 587 = STARTTLS
      auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
    })
  : null;

export const mailEnabled = () => configured;

// Sender: always shown as the product name; the address comes from SMTP_FROM
// ("Nome <addr>" or just addr) or the SMTP account itself.
const SENDER_NAME = "Venaflow";
const FROM = { name: SENDER_NAME, address: (env.SMTP_FROM.match(/<([^>]+)>/)?.[1] ?? env.SMTP_FROM).trim() || env.SMTP_USER };

const escape = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export const MAX_RECIPIENTS = 500;

/** A free-text e-mail (card e-mails, templates). Throws with the reason on failure. */
export async function sendCardMail(m: {
  to: string[]; cc?: string[]; subject: string; body: string; replyTo?: string;
  /** The template's own HTML (the body is then its plain-text version). */
  html?: string;
  attachments?: { filename: string; path: string; contentType?: string }[];
}) {
  if (!transport) throw new Error("envio de e-mail não configurado na VM");
  if (!m.to.length) throw new Error("nenhum destinatário válido");
  // Google Workspace refuses more than 500 external recipients per message (to + cc).
  if (m.to.length + (m.cc?.length ?? 0) > MAX_RECIPIENTS) {
    throw new Error(`o Google aceita no máximo ${MAX_RECIPIENTS} destinatários por e-mail (Para + Cópia)`);
  }
  const html = m.html ?? `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.5;color:#15181d;white-space:pre-wrap">${escape(m.body)}</div>`;
  const info = await transport.sendMail({
    from: FROM, to: m.to, cc: m.cc?.length ? m.cc : undefined, replyTo: m.replyTo,
    subject: m.subject, text: m.body, html, attachments: m.attachments,
  });
  return { messageId: (info as { messageId?: string }).messageId ?? null };
}

/** Plain, readable mail: a heading, paragraphs and an optional button link. Never throws. */
export async function sendMail(m: { to: string; subject: string; heading: string; paragraphs: string[]; button?: { label: string; url: string } }) {
  if (!transport) {
    console.log(`[mail desativado] para ${m.to}: ${m.subject}`);
    return false;
  }
  const text = [m.heading, "", ...m.paragraphs, ...(m.button ? ["", `${m.button.label}: ${m.button.url}`] : [])].join("\n");
  const html = `<div style="font-family:Arial,sans-serif;max-width:560px;color:#15181d">
<h2 style="font-size:18px">${escape(m.heading)}</h2>
${m.paragraphs.map((p) => `<p style="font-size:14px;line-height:1.5">${escape(p)}</p>`).join("\n")}
${m.button ? `<p><a href="${escape(m.button.url)}" style="display:inline-block;background:#2f5bea;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none">${escape(m.button.label)}</a></p>` : ""}
<p style="font-size:12px;color:#565e6b">Mensagem automática do Venaflow — não responda a este e-mail.</p></div>`;
  try {
    await transport.sendMail({ from: FROM, to: m.to, subject: m.subject, text, html });
    return true;
  } catch (err) {
    console.error("sendMail failed:", err);
    return false;
  }
}
