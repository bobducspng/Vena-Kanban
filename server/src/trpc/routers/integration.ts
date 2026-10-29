import { z } from "zod";
import { randomBytes } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../../db/client.js";
import { apiTokens, webhookDeliveries, webhooks } from "../../db/schema.js";
import { router, adminProcedure, assertPipeInOrg } from "../trpc.js";
import { hashToken } from "../../http/apiRoutes.js";
import { seal, unseal } from "../../driveBackup.js";
import { testWebhook, WEBHOOK_EVENTS } from "../../webhooks.js";
import { assertPublicUrl } from "../../automations.js";
import { env } from "../../env.js";

const eventList = z.array(z.enum(Object.keys(WEBHOOK_EVENTS) as [string, ...string[]])).min(1);

async function hookInOrg(id: string, orgId: string) {
  const w = (await db.select().from(webhooks).where(and(eq(webhooks.id, id), eq(webhooks.orgId, orgId))).limit(1))[0];
  if (!w) throw new TRPCError({ code: "NOT_FOUND", message: "Webhook não encontrado" });
  return w;
}
async function checkUrl(url: string) {
  try { await assertPublicUrl(url); } catch (e) { throw new TRPCError({ code: "BAD_REQUEST", message: `Endereço recusado: ${(e as Error).message}` }); }
}

/** Configurações > Integrações (API keys) and Configurar pipe > Webhooks. Admins only. */
export const integrationRouter = router({
  apiBase: adminProcedure.query(() => ({ base: `${env.PUBLIC_BASE_URL}/api/v1`, events: WEBHOOK_EVENTS })),

  tokens: adminProcedure.query(async ({ ctx }) =>
    db.select({ id: apiTokens.id, name: apiTokens.name, prefix: apiTokens.prefix, createdAt: apiTokens.createdAt, lastUsedAt: apiTokens.lastUsedAt, revokedAt: apiTokens.revokedAt })
      .from(apiTokens).where(eq(apiTokens.orgId, ctx.orgId)).orderBy(desc(apiTokens.createdAt))),
  /** The key is returned once; only its hash is kept. */
  createToken: adminProcedure.input(z.object({ name: z.string().trim().min(1).max(120) })).mutation(async ({ ctx, input }) => {
    const token = `vf_${randomBytes(24).toString("base64url")}`;
    await db.insert(apiTokens).values({ id: crypto.randomUUID(), orgId: ctx.orgId, name: input.name, tokenHash: hashToken(token), prefix: token.slice(0, 7), createdBy: ctx.userId });
    return { token };
  }),
  revokeToken: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await db.update(apiTokens).set({ revokedAt: new Date() }).where(and(eq(apiTokens.id, input.id), eq(apiTokens.orgId, ctx.orgId)));
    return { ok: true };
  }),

  webhooks: adminProcedure.input(z.object({ pipeId: z.string() })).query(async ({ ctx, input }) => {
    await assertPipeInOrg(input.pipeId, ctx.orgId);
    const list = await db.select().from(webhooks).where(eq(webhooks.pipeId, input.pipeId)).orderBy(desc(webhooks.createdAt));
    return Promise.all(list.map(async (w) => ({
      id: w.id, url: w.url, events: w.events as string[], active: w.active, createdAt: w.createdAt,
      last: (await db.select().from(webhookDeliveries).where(eq(webhookDeliveries.webhookId, w.id)).orderBy(desc(webhookDeliveries.createdAt)).limit(1))[0] ?? null,
    })));
  }),
  createWebhook: adminProcedure.input(z.object({ pipeId: z.string(), url: z.string().trim().url().max(1000), events: eventList })).mutation(async ({ ctx, input }) => {
    await assertPipeInOrg(input.pipeId, ctx.orgId);
    await checkUrl(input.url);
    const secret = `whsec_${randomBytes(24).toString("base64url")}`;
    const id = crypto.randomUUID();
    await db.insert(webhooks).values({ id, orgId: ctx.orgId, pipeId: input.pipeId, url: input.url, events: input.events, secret: seal(secret), createdBy: ctx.userId });
    return { id, secret };
  }),
  updateWebhook: adminProcedure.input(z.object({ id: z.string(), url: z.string().trim().url().max(1000).optional(), events: eventList.optional(), active: z.boolean().optional() })).mutation(async ({ ctx, input }) => {
    await hookInOrg(input.id, ctx.orgId);
    if (input.url) await checkUrl(input.url);
    const { id, ...patch } = input;
    await db.update(webhooks).set(patch).where(eq(webhooks.id, id));
    return { ok: true };
  }),
  removeWebhook: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await hookInOrg(input.id, ctx.orgId);
    await db.delete(webhookDeliveries).where(eq(webhookDeliveries.webhookId, input.id));
    await db.delete(webhooks).where(eq(webhooks.id, input.id));
    return { ok: true };
  }),
  webhookSecret: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => ({ secret: unseal((await hookInOrg(input.id, ctx.orgId)).secret) })),
  testWebhook: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await hookInOrg(input.id, ctx.orgId);
    return testWebhook(input.id);
  }),
  deliveries: adminProcedure.input(z.object({ id: z.string() })).query(async ({ ctx, input }) => {
    await hookInOrg(input.id, ctx.orgId);
    return db.select().from(webhookDeliveries).where(eq(webhookDeliveries.webhookId, input.id)).orderBy(desc(webhookDeliveries.createdAt)).limit(30);
  }),
});
