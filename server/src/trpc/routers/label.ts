import { z } from "zod";
import { eq, asc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../../db/client.js";
import { labels, cardLabels } from "../../db/schema.js";
import { router, protectedProcedure, adminProcedure, assertPipeInOrg } from "../trpc.js";

const color = z.enum(["gray", "red", "orange", "amber", "green", "teal", "blue", "purple", "pink"]);

async function labelInOrg(labelId: string, orgId: string) {
  const label = (await db.select().from(labels).where(eq(labels.id, labelId)).limit(1))[0];
  if (!label) throw new TRPCError({ code: "NOT_FOUND", message: "Etiqueta não encontrada" });
  await assertPipeInOrg(label.pipeId, orgId);
  return label;
}

/** Labels are defined per pipe (admins) and attached to cards (anyone, via card.setLabels). */
export const labelRouter = router({
  listByPipe: protectedProcedure.input(z.object({ pipeId: z.string() })).query(async ({ ctx, input }) => {
    await assertPipeInOrg(input.pipeId, ctx.orgId);
    return db.select().from(labels).where(eq(labels.pipeId, input.pipeId)).orderBy(asc(labels.name));
  }),

  create: adminProcedure
    .input(z.object({ pipeId: z.string(), name: z.string().trim().min(1).max(255), color: color.default("blue") }))
    .mutation(async ({ ctx, input }) => {
      await assertPipeInOrg(input.pipeId, ctx.orgId);
      const id = crypto.randomUUID();
      await db.insert(labels).values({ id, pipeId: input.pipeId, name: input.name, color: input.color });
      return (await db.select().from(labels).where(eq(labels.id, id)).limit(1))[0];
    }),

  update: adminProcedure
    .input(z.object({ labelId: z.string(), name: z.string().trim().min(1).max(255).optional(), color: color.optional() }))
    .mutation(async ({ ctx, input }) => {
      await labelInOrg(input.labelId, ctx.orgId);
      const { labelId, ...patch } = input;
      if (Object.keys(patch).length) await db.update(labels).set(patch).where(eq(labels.id, labelId));
      return (await db.select().from(labels).where(eq(labels.id, labelId)).limit(1))[0];
    }),

  /** Removing a label also takes it off every card. */
  remove: adminProcedure.input(z.object({ labelId: z.string() })).mutation(async ({ ctx, input }) => {
    await labelInOrg(input.labelId, ctx.orgId);
    await db.transaction(async (tx) => {
      await tx.delete(cardLabels).where(eq(cardLabels.labelId, input.labelId));
      await tx.delete(labels).where(eq(labels.id, input.labelId));
    });
    return { ok: true };
  }),
});
