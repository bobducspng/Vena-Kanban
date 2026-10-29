import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../../db/client.js";
import { pdfTemplates } from "../../db/schema.js";
import { router, protectedProcedure, adminProcedure, assertPipeInOrg } from "../trpc.js";
import { cardForWrite } from "../cardAccess.js";
import { DEFAULT_BODY, generateCardPdf } from "../../pdf.js";

const tpl = { name: z.string().trim().min(1).max(255), body: z.string().min(1).max(50_000) };

async function templateInOrg(templateId: string, orgId: string) {
  const t = (await db.select().from(pdfTemplates).where(eq(pdfTemplates.id, templateId)).limit(1))[0];
  if (!t) throw new TRPCError({ code: "NOT_FOUND", message: "Modelo não encontrado" });
  await assertPipeInOrg(t.pipeId, orgId);
  return t;
}

/** Modelos de PDF (admins) and "Gerar PDF" on a card. */
export const pdfRouter = router({
  templates: protectedProcedure.input(z.object({ pipeId: z.string() })).query(async ({ ctx, input }) => {
    await assertPipeInOrg(input.pipeId, ctx.orgId);
    return db.select().from(pdfTemplates).where(eq(pdfTemplates.pipeId, input.pipeId)).orderBy(asc(pdfTemplates.name));
  }),
  defaultBody: protectedProcedure.query(() => DEFAULT_BODY),
  create: adminProcedure.input(z.object({ pipeId: z.string(), ...tpl })).mutation(async ({ ctx, input }) => {
    await assertPipeInOrg(input.pipeId, ctx.orgId);
    const id = crypto.randomUUID();
    await db.insert(pdfTemplates).values({ id, ...input });
    return { id };
  }),
  update: adminProcedure.input(z.object({ templateId: z.string(), ...tpl })).mutation(async ({ ctx, input }) => {
    await templateInOrg(input.templateId, ctx.orgId);
    await db.update(pdfTemplates).set({ name: input.name, body: input.body }).where(eq(pdfTemplates.id, input.templateId));
    return { ok: true };
  }),
  remove: adminProcedure.input(z.object({ templateId: z.string() })).mutation(async ({ ctx, input }) => {
    await templateInOrg(input.templateId, ctx.orgId);
    await db.delete(pdfTemplates).where(eq(pdfTemplates.id, input.templateId));
    return { ok: true };
  }),

  /** Generate (templateId null = resumo do card); the PDF becomes a card attachment. */
  generate: protectedProcedure.input(z.object({ cardId: z.string(), templateId: z.string().nullable() })).mutation(async ({ ctx, input }) => {
    const card = await cardForWrite(input.cardId, ctx.orgId);
    if (input.templateId && (await templateInOrg(input.templateId, ctx.orgId)).pipeId !== card.pipeId) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "O modelo é de outro pipe" });
    }
    return generateCardPdf(card.id, input.templateId, ctx.userId);
  }),
});
