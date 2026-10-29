import { z } from "zod";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../../db/client.js";
import { phaseFormLinks, phases, requestMessages, requests, users } from "../../db/schema.js";
import { router, protectedProcedure } from "../trpc.js";
import { cardInOrg, logEvent } from "../cardAccess.js";
import { newToken } from "../../publicForms.js";
import { env } from "../../env.js";
import { sendMail } from "../../mailer.js";

/** Team side of what people outside see: phase-form links and requester messages. */
export const phaseLinkUrl = (token: string) => `${env.PUBLIC_BASE_URL}/t/${token}`;
export const requestUrl = (token: string) => `${env.PUBLIC_BASE_URL}/pedidos/${token}`;

export const outsideRouter = router({
  phaseLinks: protectedProcedure.input(z.object({ cardId: z.string() })).query(async ({ ctx, input }) => {
    await cardInOrg(input.cardId, ctx.orgId);
    const rows = await db.select({ link: phaseFormLinks, phaseName: phases.name }).from(phaseFormLinks)
      .innerJoin(phases, eq(phases.id, phaseFormLinks.phaseId))
      .where(eq(phaseFormLinks.cardId, input.cardId)).orderBy(desc(phaseFormLinks.createdAt));
    return rows.map((r) => ({ ...r.link, phaseName: r.phaseName, url: phaseLinkUrl(r.link.token) }));
  }),

  /** Link for the card's current phase; optionally e-mailed to someone. */
  createPhaseLink: protectedProcedure
    .input(z.object({ cardId: z.string(), sendTo: z.string().trim().email().max(320).optional(), note: z.string().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      const card = await cardInOrg(input.cardId, ctx.orgId);
      const phase = (await db.select().from(phases).where(eq(phases.id, card.currentPhaseId)).limit(1))[0];
      const token = newToken();
      await db.insert(phaseFormLinks).values({ id: crypto.randomUUID(), cardId: card.id, phaseId: card.currentPhaseId, token, sentTo: input.sendTo ?? null, createdBy: ctx.userId });
      await logEvent(card.id, "phase_link_created", ctx.userId, { phase: phase?.name, sentTo: input.sendTo });
      let mailed = false;
      if (input.sendTo) {
        mailed = await sendMail({
          to: input.sendTo,
          subject: `Preencha: ${card.title} (#${card.number})`,
          heading: `Precisamos de algumas informações`,
          paragraphs: [`Card #${card.number} · ${card.title} — etapa "${phase?.name}".`, ...(input.note ? [input.note] : [])],
          button: { label: "Preencher", url: phaseLinkUrl(token) },
        });
      }
      return { url: phaseLinkUrl(token), mailed };
    }),

  revokePhaseLink: protectedProcedure.input(z.object({ linkId: z.string() })).mutation(async ({ ctx, input }) => {
    const link = (await db.select().from(phaseFormLinks).where(eq(phaseFormLinks.id, input.linkId)).limit(1))[0];
    if (!link) throw new TRPCError({ code: "NOT_FOUND" });
    await cardInOrg(link.cardId, ctx.orgId);
    await db.update(phaseFormLinks).set({ revokedAt: new Date() }).where(eq(phaseFormLinks.id, link.id));
    return { ok: true };
  }),

  /** Requester of a card (formulário público) with the message thread. */
  request: protectedProcedure.input(z.object({ cardId: z.string() })).query(async ({ ctx, input }) => {
    await cardInOrg(input.cardId, ctx.orgId);
    const req = (await db.select().from(requests).where(eq(requests.cardId, input.cardId)).limit(1))[0];
    if (!req) return null;
    const msgs = await db.select().from(requestMessages).where(eq(requestMessages.requestId, req.id)).orderBy(asc(requestMessages.createdAt));
    const authorIds = [...new Set(msgs.map((m) => m.authorId).filter((x): x is string => !!x))];
    const names = authorIds.length ? await db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, authorIds)) : [];
    return {
      id: req.id, email: req.email,
      messages: msgs.map((m) => ({ ...m, authorName: m.fromRequester ? "Solicitante" : names.find((n) => n.id === m.authorId)?.name ?? "Equipe" })),
    };
  }),

  /** Team reply: stored and e-mailed to the requester with the tracking link. */
  reply: protectedProcedure.input(z.object({ requestId: z.string(), body: z.string().trim().min(1).max(5000) })).mutation(async ({ ctx, input }) => {
    const req = (await db.select().from(requests).where(eq(requests.id, input.requestId)).limit(1))[0];
    if (!req) throw new TRPCError({ code: "NOT_FOUND" });
    const card = await cardInOrg(req.cardId, ctx.orgId);
    await db.insert(requestMessages).values({ id: crypto.randomUUID(), requestId: req.id, fromRequester: false, authorId: ctx.userId, body: input.body });
    await logEvent(card.id, "request_reply", ctx.userId);
    let mailed = false;
    if (req.email) {
      mailed = await sendMail({
        to: req.email,
        subject: `Resposta sobre a solicitação #${card.number}`,
        heading: `Nova mensagem sobre a solicitação #${card.number}`,
        paragraphs: [input.body],
        button: { label: "Ver e responder", url: requestUrl(req.accessToken) },
      });
    }
    return { mailed };
  }),
});

