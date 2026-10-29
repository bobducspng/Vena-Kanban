import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../db/client.js";
import { cards, requests } from "../db/schema.js";
import { createCard } from "../cardService.js";
import { liveForm, newToken, publicDefinition, PUBLIC_TYPES, NOT_PUBLIC_TYPES, readBranding } from "../publicForms.js";
import { sendMail } from "../mailer.js";

/** Routes without login (formulário público). Light protection, as decided:
 *  per-IP rate limits, a honeypot field, and only safe field types accepted. */
export const publicRoutes = Router();

const readLimit = rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: true, legacyHeaders: false });
const submitLimit = rateLimit({
  windowMs: 10 * 60_000, limit: 10, standardHeaders: true, legacyHeaders: false,
  message: { error: "Muitos envios em pouco tempo. Tente de novo em alguns minutos." },
});

publicRoutes.get("/public/forms/:slug", readLimit, async (req, res) => {
  const def = await publicDefinition(String(req.params.slug));
  if (!def) return res.status(404).json({ error: "Formulário não encontrado ou desativado." });
  res.json(def);
});

const submission = z.object({
  values: z.array(z.object({
    fieldId: z.string(),
    value: z.union([z.string().max(10_000), z.number(), z.boolean(), z.null(), z.array(z.string().max(255)).max(200)]),
  })).max(200),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
  website: z.string().optional(), // honeypot: people never see it; bots fill it
});

publicRoutes.post("/public/forms/:slug", submitLimit, async (req, res) => {
  const f = await liveForm(String(req.params.slug));
  if (!f) return res.status(404).json({ error: "Formulário não encontrado ou desativado." });
  if (f.form.closed) return res.status(403).json({ error: "Este formulário não está recebendo respostas." });
  const parsed = submission.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos." });
  const { values, email, website } = parsed.data;
  // Honeypot filled → pretend success, store nothing.
  if (website) return res.json({ ok: true, number: null });
  const b = readBranding(f.form.branding);
  if (b.askEmail === "required" && !email) return res.status(400).json({ error: "Informe seu e-mail." });

  // Only fields the public page shows may be filled (not connections, people, labels…).
  const def = await publicDefinition(f.form.slug);
  const allowed = new Set((def?.fields ?? []).filter((x) => PUBLIC_TYPES.has(x.type)).map((x) => x.id));
  if (values.some((v) => !allowed.has(v.fieldId))) return res.status(400).json({ error: "Campo inválido." });

  try {
    const cardId = await createCard({
      pipeId: f.form.pipeId, title: "", values, orgId: f.orgId,
      actor: { userId: null, via: "Formulário público", depth: 0 },
      skipRequiredTypes: NOT_PUBLIC_TYPES,
    });
    const card = (await db.select({ number: cards.number, title: cards.title }).from(cards).where(eq(cards.id, cardId)).limit(1))[0];
    if (email) {
      await db.insert(requests).values({ id: crypto.randomUUID(), cardId, formId: f.form.id, email: email.toLowerCase(), accessToken: newToken() });
      await sendMail({
        to: email,
        subject: `Recebemos sua solicitação #${card?.number}`,
        heading: `Solicitação #${card?.number} recebida`,
        paragraphs: [b.confirmMessage, `Formulário: ${f.form.title || f.pipeName}`],
      });
    }
    res.json({ ok: true, number: card?.number ?? null });
  } catch (err) {
    const msg = err instanceof TRPCError ? err.message : "Não foi possível enviar. Tente de novo.";
    if (!(err instanceof TRPCError)) console.error("public submit failed:", err);
    res.status(400).json({ error: msg });
  }
});
