import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../../db/client.js";
import { signatureRequests, signatureSigners } from "../../db/schema.js";
import { router, protectedProcedure } from "../trpc.js";
import { cardForWrite, cardInOrg } from "../cardAccess.js";
import { mailEnabled } from "../../mailer.js";
import { cancelRequest, createSignatureRequest, listForCard, resendInvite } from "../../signatures.js";

const fail = (e: unknown) => new TRPCError({ code: "BAD_REQUEST", message: e instanceof Error ? e.message : String(e) });

async function requestCard(requestId: string, orgId: string) {
  const r = (await db.select().from(signatureRequests).where(eq(signatureRequests.id, requestId)).limit(1))[0];
  if (!r) throw new TRPCError({ code: "NOT_FOUND", message: "Pedido não encontrado" });
  await cardForWrite(r.cardId, orgId);
  return r;
}

/** Card > Assinaturas. */
export const signatureRouter = router({
  listByCard: protectedProcedure.input(z.object({ cardId: z.string() })).query(async ({ ctx, input }) => {
    await cardInOrg(input.cardId, ctx.orgId);
    return listForCard(input.cardId);
  }),

  create: protectedProcedure
    .input(z.object({
      cardId: z.string(), attachmentId: z.string(), message: z.string().max(2000).optional(),
      signers: z.array(z.object({ name: z.string().trim().min(3).max(255), email: z.string().trim().email().max(320) })).min(1).max(30),
    }))
    .mutation(async ({ ctx, input }) => {
      await cardForWrite(input.cardId, ctx.orgId);
      if (!mailEnabled()) throw new TRPCError({ code: "BAD_REQUEST", message: "O envio de e-mail não está configurado na VM." });
      if (new Set(input.signers.map((s) => s.email.toLowerCase())).size !== input.signers.length) throw new TRPCError({ code: "BAD_REQUEST", message: "Há e-mails repetidos." });
      try { return await createSignatureRequest({ ...input, userId: ctx.userId }); } catch (e) { throw fail(e); }
    }),

  cancel: protectedProcedure.input(z.object({ requestId: z.string() })).mutation(async ({ ctx, input }) => {
    await requestCard(input.requestId, ctx.orgId);
    await cancelRequest(input.requestId);
    return { ok: true };
  }),

  resend: protectedProcedure.input(z.object({ signerId: z.string() })).mutation(async ({ ctx, input }) => {
    const s = (await db.select().from(signatureSigners).where(eq(signatureSigners.id, input.signerId)).limit(1))[0];
    if (!s) throw new TRPCError({ code: "NOT_FOUND", message: "Signatário não encontrado" });
    await requestCard(s.requestId, ctx.orgId);
    try { await resendInvite(input.signerId); } catch (e) { throw fail(e); }
    return { ok: true };
  }),
});
