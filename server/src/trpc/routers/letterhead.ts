import { z } from "zod";
import { and, eq, ne } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../../db/client.js";
import { letterheads, organizations, pdfTemplates, pipes } from "../../db/schema.js";
import { router, protectedProcedure, adminProcedure } from "../trpc.js";
import { dropLogoFile } from "../../http/fileRoutes.js";

const text = z.string().max(2000).transform((s) => s.trim() || null);
const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim().toLowerCase();

async function inOrg(id: string, orgId: string) {
  const l = (await db.select().from(letterheads).where(and(eq(letterheads.id, id), eq(letterheads.orgId, orgId))).limit(1))[0];
  if (!l) throw new TRPCError({ code: "NOT_FOUND", message: "Papel timbrado não encontrado" });
  return l;
}

/** The name is how a card field picks the frente, so two frentes cannot share it. */
async function assertFreeName(orgId: string, name: string, exceptId?: string) {
  const others = await db.select({ name: letterheads.name }).from(letterheads)
    .where(and(eq(letterheads.orgId, orgId), exceptId ? ne(letterheads.id, exceptId) : undefined));
  if (others.some((o) => norm(o.name) === norm(name))) throw new TRPCError({ code: "BAD_REQUEST", message: "Já existe uma frente com esse nome." });
}

/** Papéis timbrados ("frentes" da empresa) of the PDFs. Logos are uploaded at /files/branding/letterheads/:id/logo. */
export const letterheadRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const org = (await db.select({ def: organizations.defaultLetterheadId }).from(organizations).where(eq(organizations.id, ctx.orgId)).limit(1))[0];
    const rows = await db.select().from(letterheads).where(eq(letterheads.orgId, ctx.orgId));
    return rows
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))
      .map((l) => ({ id: l.id, name: l.name, header: l.header, footer: l.footer, hasLogo: !!l.logo, isDefault: l.id === org?.def }));
  }),

  create: adminProcedure.input(z.object({ name: z.string().trim().min(1).max(120), header: text, footer: text })).mutation(async ({ ctx, input }) => {
    await assertFreeName(ctx.orgId, input.name);
    const id = crypto.randomUUID();
    await db.insert(letterheads).values({ id, orgId: ctx.orgId, ...input });
    // The first frente becomes the default.
    const org = (await db.select({ def: organizations.defaultLetterheadId }).from(organizations).where(eq(organizations.id, ctx.orgId)).limit(1))[0];
    if (!org?.def) await db.update(organizations).set({ defaultLetterheadId: id }).where(eq(organizations.id, ctx.orgId));
    return { id };
  }),

  update: adminProcedure.input(z.object({ id: z.string(), name: z.string().trim().min(1).max(120), header: text, footer: text })).mutation(async ({ ctx, input }) => {
    await inOrg(input.id, ctx.orgId);
    await assertFreeName(ctx.orgId, input.name, input.id);
    const { id, ...patch } = input;
    await db.update(letterheads).set(patch).where(eq(letterheads.id, id));
    return { ok: true };
  }),

  setDefault: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    await inOrg(input.id, ctx.orgId);
    await db.update(organizations).set({ defaultLetterheadId: input.id }).where(eq(organizations.id, ctx.orgId));
    return { ok: true };
  }),

  /** Pipes and modelos that used it fall back to the default. */
  remove: adminProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const l = await inOrg(input.id, ctx.orgId);
    await db.update(pipes).set({ letterheadId: null }).where(eq(pipes.letterheadId, l.id));
    await db.update(pdfTemplates).set({ layoutMode: "pipe", letterheadId: null }).where(eq(pdfTemplates.letterheadId, l.id));
    await db.update(organizations).set({ defaultLetterheadId: null }).where(and(eq(organizations.id, ctx.orgId), eq(organizations.defaultLetterheadId, l.id)));
    await db.delete(letterheads).where(eq(letterheads.id, l.id));
    if (l.logo) await dropLogoFile(l.logo);
    return { ok: true };
  }),
});
