import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../db/client.js";
import { cardAssignees, cardEvents, cardFields, cards, fields, organizations, phaseFormLinks, phases, pipes, publicForms, requestMessages, requests } from "../db/schema.js";
import { createCard, setFieldValue } from "../cardService.js";
import { liveForm, newToken, publicDefinition, PUBLIC_TYPES, NOT_PUBLIC_TYPES, readBranding } from "../publicForms.js";
import { sendMail } from "../mailer.js";
import { formUrl } from "../publicForms.js";
import { notifyOutside } from "../notify.js";
import { requestUrl } from "../trpc/routers/outside.js";
import { sign, signerDocument, signerView } from "../signatures.js";

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
      const accessToken = newToken();
      await db.insert(requests).values({ id: crypto.randomUUID(), cardId, formId: f.form.id, email: email.toLowerCase(), accessToken });
      await sendMail({
        to: email,
        subject: `Recebemos sua solicitação #${card?.number}`,
        heading: `Solicitação #${card?.number} recebida`,
        paragraphs: [b.confirmMessage, `Formulário: ${f.form.title || f.pipeName}`],
        button: { label: "Acompanhar solicitação", url: requestUrl(accessToken) },
      });
    }
    res.json({ ok: true, number: card?.number ?? null });
  } catch (err) {
    const msg = err instanceof TRPCError ? err.message : "Não foi possível enviar. Tente de novo.";
    if (!(err instanceof TRPCError)) console.error("public submit failed:", err);
    res.status(400).json({ error: msg });
  }
});

// --- Formulário de fase por link -------------------------------------------------
/** The link, its card and the phase fields it may fill (only while the card is in that phase). */
async function phaseLink(token: string) {
  const link = (await db.select().from(phaseFormLinks).where(eq(phaseFormLinks.token, token)).limit(1))[0];
  if (!link || link.revokedAt) return null;
  const card = (await db.select().from(cards).where(eq(cards.id, link.cardId)).limit(1))[0];
  if (!card || card.deletedAt) return null;
  const pipe = (await db.select({ name: pipes.name, orgId: pipes.orgId }).from(pipes).where(eq(pipes.id, card.pipeId)).limit(1))[0];
  const phase = (await db.select().from(phases).where(eq(phases.id, link.phaseId)).limit(1))[0];
  const defs = (await db.select().from(fields).where(and(eq(fields.phaseId, link.phaseId), isNull(fields.archivedAt))))
    .filter((x) => PUBLIC_TYPES.has(x.type)).sort((a, b) => a.position - b.position);
  return { link, card, pipe, phase, defs, open: card.currentPhaseId === link.phaseId };
}

publicRoutes.get("/public/phase/:token", readLimit, async (req, res) => {
  const l = await phaseLink(String(req.params.token));
  if (!l) return res.status(404).json({ error: "Link inválido ou revogado." });
  const vals = await db.select().from(cardFields).where(eq(cardFields.cardId, l.card.id));
  res.json({
    title: `#${l.card.number} · ${l.card.title}`, pipeName: l.pipe?.name, phaseName: l.phase?.name, open: l.open, submittedAt: l.link.submittedAt,
    fields: l.defs.map((x) => ({ id: x.id, label: x.label, type: x.type, required: x.required, options: x.options, description: x.description, help: x.help, validationRegex: x.validationRegex, isUnique: false, position: x.position, phaseId: x.phaseId })),
    values: vals.filter((v) => l.defs.some((d) => d.id === v.fieldId)).map((v) => ({ fieldId: v.fieldId, value: v.value })),
  });
});

publicRoutes.post("/public/phase/:token", submitLimit, async (req, res) => {
  const l = await phaseLink(String(req.params.token));
  if (!l) return res.status(404).json({ error: "Link inválido ou revogado." });
  if (!l.open) return res.status(403).json({ error: "Esta etapa já foi concluída; o formulário não aceita mais respostas." });
  const parsed = submission.pick({ values: true, website: true }).safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Dados inválidos." });
  if (parsed.data.website) return res.json({ ok: true });
  const allowed = new Set(l.defs.map((d) => d.id));
  if (parsed.data.values.some((v) => !allowed.has(v.fieldId))) return res.status(400).json({ error: "Campo inválido." });
  const missing = l.defs.filter((d) => d.required && !parsed.data.values.some((v) => v.fieldId === d.id && v.value !== null && v.value !== "" && v.value !== false && !(Array.isArray(v.value) && !v.value.length)));
  if (missing.length) return res.status(400).json({ error: `Preencha os campos obrigatórios: ${missing.map((d) => d.label).join(", ")}` });
  try {
    for (const v of parsed.data.values) {
      const fresh = (await db.select().from(cards).where(eq(cards.id, l.card.id)).limit(1))[0];
      await setFieldValue({ card: fresh, fieldId: v.fieldId, value: v.value, orgId: l.pipe!.orgId, actor: { userId: null, via: "Formulário de fase", depth: 0 }, checkEditable: false });
    }
    await db.update(phaseFormLinks).set({ submittedAt: new Date() }).where(eq(phaseFormLinks.id, l.link.id));
    const people = (await db.select({ userId: cardAssignees.userId }).from(cardAssignees).where(eq(cardAssignees.cardId, l.card.id))).map((a) => a.userId);
    await notifyOutside(people, l.card.id, `Formulário de fase preenchido${l.link.sentTo ? ` por ${l.link.sentTo}` : ""}`);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err instanceof TRPCError ? err.message : "Não foi possível enviar." });
  }
});

// --- Meus pedidos (magic link) ------------------------------------------------------
const STATUS_EVENTS = ["created", "moved"];

publicRoutes.get("/public/requests/:token", readLimit, async (req, res) => {
  const mine = (await db.select().from(requests).where(eq(requests.accessToken, String(req.params.token))).limit(1))[0];
  if (!mine) return res.status(404).json({ error: "Link inválido." });
  // The link proves the e-mail: list every request of that e-mail (newest first).
  const all = mine.email ? await db.select().from(requests).where(eq(requests.email, mine.email)).orderBy(desc(requests.createdAt)).limit(100) : [mine];
  const ids = all.map((r) => r.cardId);
  const rows = await db.select({ id: cards.id, number: cards.number, title: cards.title, done: cards.done, deletedAt: cards.deletedAt, phase: phases.name, createdAt: cards.createdAt })
    .from(cards).innerJoin(phases, eq(phases.id, cards.currentPhaseId)).where(inArray(cards.id, ids));
  const current = rows.find((r) => r.id === mine.cardId);
  const history = await db.select({ type: cardEvents.type, toPhaseId: cardEvents.toPhaseId, createdAt: cardEvents.createdAt })
    .from(cardEvents).where(and(eq(cardEvents.cardId, mine.cardId), inArray(cardEvents.type, STATUS_EVENTS))).orderBy(asc(cardEvents.createdAt));
  const phaseNames = await db.select({ id: phases.id, name: phases.name }).from(phases).where(inArray(phases.id, history.map((h) => h.toPhaseId).filter((x): x is string => !!x).concat(["-"])));
  const messages = await db.select({ fromRequester: requestMessages.fromRequester, body: requestMessages.body, createdAt: requestMessages.createdAt })
    .from(requestMessages).where(eq(requestMessages.requestId, mine.id)).orderBy(asc(requestMessages.createdAt));
  res.json({
    email: mine.email,
    current: current && !current.deletedAt ? { number: current.number, title: current.title, phase: current.phase, done: current.done, createdAt: current.createdAt } : null,
    history: history.map((h) => ({ at: h.createdAt, text: h.type === "created" ? "Solicitação recebida" : `Em: ${phaseNames.find((p) => p.id === h.toPhaseId)?.name ?? "?"}` })),
    messages,
    others: all.filter((r) => r.id !== mine.id).map((r) => {
      const c = rows.find((x) => x.id === r.cardId);
      return c && !c.deletedAt ? { token: r.accessToken, number: c.number, title: c.title, phase: c.phase, done: c.done, createdAt: c.createdAt } : null;
    }).filter(Boolean),
  });
});

publicRoutes.post("/public/requests/:token/messages", submitLimit, async (req, res) => {
  const mine = (await db.select().from(requests).where(eq(requests.accessToken, String(req.params.token))).limit(1))[0];
  if (!mine) return res.status(404).json({ error: "Link inválido." });
  const body = z.object({ body: z.string().trim().min(1).max(5000), website: z.string().optional() }).safeParse(req.body);
  if (!body.success) return res.status(400).json({ error: "Escreva a mensagem." });
  if (body.data.website) return res.json({ ok: true });
  await db.insert(requestMessages).values({ id: crypto.randomUUID(), requestId: mine.id, fromRequester: true, body: body.data.body });
  await db.insert(cardEvents).values({ id: crypto.randomUUID(), cardId: mine.cardId, type: "request_message", actorId: null, data: { via: "Solicitante" } });
  const people = (await db.select({ userId: cardAssignees.userId }).from(cardAssignees).where(eq(cardAssignees.cardId, mine.cardId))).map((a) => a.userId);
  await notifyOutside(people, mine.cardId, "Mensagem do solicitante", body.data.body);
  res.json({ ok: true });
});

// --- Portal ---------------------------------------------------------------------------
publicRoutes.get("/public/portal", readLimit, async (_req, res) => {
  const org = (await db.select({ name: organizations.name }).from(organizations).limit(1))[0];
  const forms = await db.select({ form: publicForms, pipeName: pipes.name, pipeIcon: pipes.icon })
    .from(publicForms).innerJoin(pipes, eq(pipes.id, publicForms.pipeId))
    .where(and(eq(publicForms.isPublic, true), isNull(pipes.deletedAt)));
  res.json({
    name: org?.name ?? "Portal",
    forms: forms
      .filter((f) => readBranding(f.form.branding).showInPortal)
      .map((f) => ({ title: f.form.title || f.pipeName, icon: f.pipeIcon, description: readBranding(f.form.branding).description, url: formUrl(f.form.slug), closed: f.form.closed }))
      .sort((a, b) => a.title.localeCompare(b.title)),
  });
});

// --- Assinatura eletrônica (M11) ----------------------------------------------------
const signLimit = rateLimit({
  windowMs: 10 * 60_000, limit: 20, standardHeaders: true, legacyHeaders: false,
  message: { error: "Muitas tentativas em pouco tempo. Tente de novo em alguns minutos." },
});

publicRoutes.get("/public/sign/:token", readLimit, async (req, res) => {
  const v = await signerView(String(req.params.token));
  if (!v) return res.status(404).json({ error: "Link de assinatura inválido." });
  const { _internal: _, ...view } = v;
  res.json(view);
});

publicRoutes.get("/public/sign/:token/document", readLimit, async (req, res) => {
  const d = await signerDocument(String(req.params.token));
  if (!d) return res.status(404).send("Documento indisponível.");
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Disposition", `inline; filename*=UTF-8''${encodeURIComponent(d.filename)}`);
  res.sendFile(d.path);
});

const signBody = z.object({
  name: z.string().trim().min(3).max(255),
  document: z.string().trim().max(20).optional(),
  agree: z.literal(true),
});

publicRoutes.post("/public/sign/:token", signLimit, async (req, res) => {
  const parsed = signBody.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: "Confirme que leu o documento e digite seu nome completo." });
  const cpf = parsed.data.document?.replace(/\D/g, "");
  if (cpf && cpf.length !== 11) return res.status(400).json({ error: "CPF inválido (11 dígitos)." });
  try {
    const r = await sign(String(req.params.token), { name: parsed.data.name, document: cpf }, { ip: req.ip ?? "", userAgent: String(req.headers["user-agent"] ?? "") });
    res.json(r);
  } catch (e) {
    res.status(400).json({ error: e instanceof Error ? e.message : "Não foi possível assinar." });
  }
});
