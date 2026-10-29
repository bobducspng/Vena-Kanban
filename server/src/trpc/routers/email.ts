import { z } from "zod";
import { asc, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../../db/client.js";
import { cardEmails, emailTemplates, users } from "../../db/schema.js";
import { router, protectedProcedure, adminProcedure, assertPipeInOrg } from "../trpc.js";
import { cardInOrg, cardForWrite } from "../cardAccess.js";
import { renderTemplate, sendFromCard } from "../../emails.js";
import { mailEnabled, MAX_RECIPIENTS } from "../../mailer.js";

const tpl = {
  name: z.string().trim().min(1).max(255),
  toSpec: z.string().max(1000).default(""),
  ccSpec: z.string().max(1000).default(""),
  subject: z.string().trim().min(1).max(500),
  body: z.string().min(1).max(20_000),
};
const addr = z.string().trim().email().max(320);

async function templateInOrg(templateId: string, orgId: string) {
  const t = (await db.select().from(emailTemplates).where(eq(emailTemplates.id, templateId)).limit(1))[0];
  if (!t) throw new TRPCError({ code: "NOT_FOUND", message: "Template não encontrado" });
  await assertPipeInOrg(t.pipeId, orgId);
  return t;
}

/** E-mail templates (admins) and e-mails sent from cards (everyone). */
export const emailRouter = router({
  enabled: protectedProcedure.query(() => mailEnabled()),

  templates: protectedProcedure.input(z.object({ pipeId: z.string() })).query(async ({ ctx, input }) => {
    await assertPipeInOrg(input.pipeId, ctx.orgId);
    return db.select().from(emailTemplates).where(eq(emailTemplates.pipeId, input.pipeId)).orderBy(asc(emailTemplates.name));
  }),
  createTemplate: adminProcedure.input(z.object({ pipeId: z.string(), ...tpl })).mutation(async ({ ctx, input }) => {
    await assertPipeInOrg(input.pipeId, ctx.orgId);
    const id = crypto.randomUUID();
    await db.insert(emailTemplates).values({ id, ...input });
    return { id };
  }),
  updateTemplate: adminProcedure.input(z.object({ templateId: z.string(), ...tpl })).mutation(async ({ ctx, input }) => {
    const t = await templateInOrg(input.templateId, ctx.orgId);
    const { templateId, ...patch } = input;
    await db.update(emailTemplates).set(patch).where(eq(emailTemplates.id, t.id));
    return { ok: true };
  }),
  removeTemplate: adminProcedure.input(z.object({ templateId: z.string() })).mutation(async ({ ctx, input }) => {
    const t = await templateInOrg(input.templateId, ctx.orgId);
    await db.delete(emailTemplates).where(eq(emailTemplates.id, t.id));
    return { ok: true };
  }),

  /** A template filled with this card's data, ready to review before sending. */
  render: protectedProcedure.input(z.object({ templateId: z.string(), cardId: z.string() })).query(async ({ ctx, input }) => {
    await cardInOrg(input.cardId, ctx.orgId);
    await templateInOrg(input.templateId, ctx.orgId);
    const r = await renderTemplate(input.templateId, input.cardId);
    return { to: r.to, cc: r.cc, subject: r.subject, body: r.body };
  }),

  /** Send from the card. Replies go to the sender's own e-mail (no shared inbox yet). */
  send: protectedProcedure
    .input(z.object({
      // The total (to + cc) is checked against Google's limit when sending.
      cardId: z.string(), to: z.array(addr).min(1).max(MAX_RECIPIENTS), cc: z.array(addr).max(MAX_RECIPIENTS).default([]),
      subject: z.string().trim().min(1).max(500), body: z.string().min(1).max(50_000),
      attachmentIds: z.array(z.string()).max(20).default([]), templateId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const card = await cardForWrite(input.cardId, ctx.orgId);
      const me = (await db.select({ email: users.email }).from(users).where(eq(users.id, ctx.userId)).limit(1))[0];
      try {
        await sendFromCard({ ...input, cardId: card.id, sentBy: ctx.userId, replyTo: me?.email });
      } catch (err) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Não foi possível enviar: ${err instanceof Error ? err.message : err}` });
      }
      return { ok: true };
    }),

  history: protectedProcedure.input(z.object({ cardId: z.string() })).query(async ({ ctx, input }) => {
    await cardInOrg(input.cardId, ctx.orgId);
    return db.select().from(cardEmails).where(eq(cardEmails.cardId, input.cardId)).orderBy(desc(cardEmails.createdAt)).limit(100);
  }),
});
