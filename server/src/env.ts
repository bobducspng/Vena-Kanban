import { z } from "zod";

/** Validate environment at boot. Secrets live in .env on the VM, never in code. */
const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().default(4000),

  // MySQL on the same VM
  DB_HOST: z.string().default("127.0.0.1"),
  DB_PORT: z.coerce.number().default(3306),
  DB_USER: z.string(),
  DB_PASSWORD: z.string(),
  DB_NAME: z.string(),

  // Google OAuth 2.0 (your own developer app)
  GOOGLE_CLIENT_ID: z.string(),
  GOOGLE_CLIENT_SECRET: z.string(),

  // Public base URL — build every OAuth redirect / form link from this, never
  // from the request host (ngrok's free URL changes on restart). Use ngrok's
  // one free static domain.
  PUBLIC_BASE_URL: z.string().url(),
  // Where the SPA is served (for CORS + post-login redirect)
  APP_ORIGIN: z.string().url(),

  // Signing secret for session cookies
  SESSION_SECRET: z.string().min(16),

  // Login allowlist (uso interno atrás de túnel público). Pelo menos um dos dois
  // deve conter algo em produção, senão QUALQUER conta Google entraria e viraria
  // admin. Listas separadas por vírgula; e-mail tem prioridade sobre domínio.
  ALLOWED_EMAIL_DOMAINS: z.string().default(""), // ex.: "suaempresa.com,parceiro.com"
  ALLOWED_EMAILS: z.string().default(""),         // ex.: "voce@gmail.com,socio@gmail.com"

  // Outgoing e-mail (optional: without it nothing is sent, the rest works).
  // Google Workspace: smtp.gmail.com, 465, the account + an app password.
  SMTP_HOST: z.string().default(""),
  SMTP_PORT: z.coerce.number().default(465),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  SMTP_FROM: z.string().default(""), // e.g. "Venaflow <comunicacao@vena.app.br>"
});

export const env = schema.parse(process.env);
export const isProd = env.NODE_ENV === "production";

const csv = (s: string) => s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean);
const allowedDomains = csv(env.ALLOWED_EMAIL_DOMAINS);
const allowedEmails = csv(env.ALLOWED_EMAILS);

/** Whether an allowlist is configured at all. */
export const hasLoginAllowlist = allowedDomains.length > 0 || allowedEmails.length > 0;

/** True if this e-mail may sign in. With no allowlist configured, everyone is
 *  allowed in dev, but NOBODY in production (fail closed — avoids an open door). */
export function isEmailAllowed(email: string): boolean {
  if (!hasLoginAllowlist) return !isProd;
  const e = email.trim().toLowerCase();
  if (allowedEmails.includes(e)) return true;
  const domain = e.split("@")[1] ?? "";
  return allowedDomains.includes(domain);
}
