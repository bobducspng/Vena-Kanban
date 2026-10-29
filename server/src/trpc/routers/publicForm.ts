import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../../db/client.js";
import { fields, phases, publicForms } from "../../db/schema.js";
import { router, adminProcedure, assertPipeInOrg } from "../trpc.js";
import { branding, formUrl, newToken, NOT_PUBLIC_TYPES, readBranding } from "../../publicForms.js";
import { mailEnabled } from "../../mailer.js";

/** Admin side of the formulário público of a pipe. */
async function formOf(pipeId: string) {
  return (await db.select().from(publicForms).where(eq(publicForms.pipeId, pipeId)).limit(1))[0] ?? null;
}

export const publicFormRouter = router({
  get: adminProcedure.input(z.object({ pipeId: z.string() })).query(async ({ ctx, input }) => {
    await assertPipeInOrg(input.pipeId, ctx.orgId);
    const f = await formOf(input.pipeId);
    // Start-form fields the public page cannot show (the team fills them later).
    const start = (await db.select().from(phases).where(and(eq(phases.pipeId, input.pipeId), eq(phases.isStart, true))).limit(1))[0];
    const hidden = start
      ? (await db.select({ label: fields.label, type: fields.type, required: fields.required }).from(fields).where(eq(fields.phaseId, start.id)))
          .filter((x) => NOT_PUBLIC_TYPES.includes(x.type)).map((x) => ({ label: x.label, required: x.required }))
      : [];
    return {
      form: f ? { ...f, branding: readBranding(f.branding), url: formUrl(f.slug) } : null,
      hiddenFields: hidden,
      mailEnabled: mailEnabled(),
    };
  }),

  /** Publish (creating it the first time) or unpublish. */
  setPublished: adminProcedure.input(z.object({ pipeId: z.string(), published: z.boolean() })).mutation(async ({ ctx, input }) => {
    await assertPipeInOrg(input.pipeId, ctx.orgId);
    const f = await formOf(input.pipeId);
    if (f) await db.update(publicForms).set({ isPublic: input.published }).where(eq(publicForms.id, f.id));
    else if (input.published) await db.insert(publicForms).values({ id: crypto.randomUUID(), pipeId: input.pipeId, slug: newToken(), branding: readBranding({}) });
    return { ok: true };
  }),

  update: adminProcedure
    .input(z.object({ pipeId: z.string(), title: z.string().max(255).nullable().optional(), closed: z.boolean().optional(), branding: branding.partial().optional() }))
    .mutation(async ({ ctx, input }) => {
      await assertPipeInOrg(input.pipeId, ctx.orgId);
      const f = await formOf(input.pipeId);
      if (!f) throw new TRPCError({ code: "NOT_FOUND", message: "Publique o formulário antes." });
      await db.update(publicForms).set({
        ...(input.title !== undefined ? { title: input.title || null } : {}),
        ...(input.closed !== undefined ? { closed: input.closed } : {}),
        ...(input.branding ? { branding: { ...readBranding(f.branding), ...input.branding } } : {}),
      }).where(eq(publicForms.id, f.id));
      return { ok: true };
    }),

  /** New link: the old one stops working (e.g. it leaked). */
  regenerate: adminProcedure.input(z.object({ pipeId: z.string() })).mutation(async ({ ctx, input }) => {
    await assertPipeInOrg(input.pipeId, ctx.orgId);
    const f = await formOf(input.pipeId);
    if (!f) throw new TRPCError({ code: "NOT_FOUND" });
    await db.update(publicForms).set({ slug: newToken() }).where(eq(publicForms.id, f.id));
    return { ok: true };
  }),
});
