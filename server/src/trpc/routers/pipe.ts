import { z } from "zod";
import { eq, and, inArray, isNull, isNotNull, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../../db/client.js";
import { pipes, phases, fields, phaseTransitions } from "../../db/schema.js";
import { router, protectedProcedure, adminProcedure } from "../trpc.js";

export const pipeRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    db.select().from(pipes).where(and(eq(pipes.orgId, ctx.orgId), isNull(pipes.deletedAt)))
  ),

  get: protectedProcedure.input(z.object({ pipeId: z.string() })).query(async ({ ctx, input }) => {
    return (await db.select().from(pipes)
      .where(and(eq(pipes.id, input.pipeId), eq(pipes.orgId, ctx.orgId), isNull(pipes.deletedAt))).limit(1))[0] ?? null;
  }),

  // Configuring pipes is admin-only.
  create: adminProcedure
    .input(z.object({ name: z.string().min(1).max(255), description: z.string().max(2000).optional() }))
    .mutation(async ({ ctx, input }) => {
      return db.transaction(async (tx) => {
        const pipeId = crypto.randomUUID();
        await tx.insert(pipes).values({ id: pipeId, orgId: ctx.orgId, name: input.name, description: input.description, createdBy: ctx.userId });
        // Seed a usable default flow.
        const defs = [
          { name: "A fazer", color: "gray", isStart: true, isEnd: false },
          { name: "Em andamento", color: "blue", isStart: false, isEnd: false },
          { name: "Concluído", color: "green", isStart: false, isEnd: true },
        ];
        const phaseIds: string[] = [];
        for (let i = 0; i < defs.length; i++) {
          const id = crypto.randomUUID();
          phaseIds.push(id);
          await tx.insert(phases).values({ id, pipeId, name: defs[i].name, color: defs[i].color, position: i, isStart: defs[i].isStart, isEnd: defs[i].isEnd });
        }
        // Neighbours linked both ways: cards walk one phase at a time by default.
        for (let i = 1; i < phaseIds.length; i++) {
          await tx.insert(phaseTransitions).values([
            { fromPhaseId: phaseIds[i - 1], toPhaseId: phaseIds[i] },
            { fromPhaseId: phaseIds[i], toPhaseId: phaseIds[i - 1] },
          ]);
        }
        // The seeded "Título" field is the card title (no separate title box in the form).
        const titleFieldId = crypto.randomUUID();
        await tx.insert(fields).values({ id: titleFieldId, pipeId, phaseId: phaseIds[0], label: "Título", type: "short_text", required: true, position: 0 });
        await tx.update(pipes).set({ titleFieldId }).where(eq(pipes.id, pipeId));
        return (await tx.select().from(pipes).where(eq(pipes.id, pipeId)).limit(1))[0];
      });
    }),

  update: adminProcedure
    .input(z.object({
      pipeId: z.string(),
      name: z.string().trim().min(1).max(255).optional(),
      description: z.string().max(2000).nullable().optional(),
      icon: z.string().max(16).nullable().optional(),
      color: z.enum(["gray", "red", "orange", "amber", "green", "teal", "blue", "purple", "pink"]).nullable().optional(),
      noun: z.string().trim().max(64).nullable().optional(),
      createButtonLabel: z.string().trim().max(64).nullable().optional(),
      titleFieldId: z.string().nullable().optional(),
      subtitleFieldIds: z.array(z.string()).max(5).optional(),
      expirationMinutes: z.number().int().min(1).max(525_600 * 3).nullable().optional(),
      businessHoursOnly: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const pipe = (await db.select().from(pipes).where(and(eq(pipes.id, input.pipeId), eq(pipes.orgId, ctx.orgId), isNull(pipes.deletedAt))).limit(1))[0];
      if (!pipe) throw new TRPCError({ code: "NOT_FOUND", message: "Pipe não encontrado" });
      const { pipeId, ...patch } = input;
      if (patch.titleFieldId) {
        // Must be a start-form field holding text-like values.
        const start = (await db.select().from(phases).where(and(eq(phases.pipeId, pipeId), eq(phases.isStart, true))).limit(1))[0];
        const f = (await db.select().from(fields).where(eq(fields.id, patch.titleFieldId)).limit(1))[0];
        const TITLE_TYPES = ["short_text", "long_text", "select", "radio", "email", "phone", "document", "number", "date"];
        if (!f || f.phaseId !== start?.id || !TITLE_TYPES.includes(f.type) || f.archivedAt) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "O título precisa ser um campo de texto do formulário inicial." });
        }
      }
      if (patch.subtitleFieldIds?.length) {
        const ok = await db.select({ id: fields.id }).from(fields).where(and(eq(fields.pipeId, pipeId), inArray(fields.id, patch.subtitleFieldIds)));
        if (ok.length !== new Set(patch.subtitleFieldIds).size) throw new TRPCError({ code: "BAD_REQUEST", message: "Subtítulo inválido" });
      }
      if (Object.keys(patch).length) await db.update(pipes).set(patch).where(eq(pipes.id, pipeId));
      return (await db.select().from(pipes).where(eq(pipes.id, pipeId)).limit(1))[0];
    }),

  /** Excluir = hide the pipe (restorable by an admin); cards stay in the database. */
  remove: adminProcedure.input(z.object({ pipeId: z.string() })).mutation(async ({ ctx, input }) => {
    await db.update(pipes).set({ deletedAt: new Date() }).where(and(eq(pipes.id, input.pipeId), eq(pipes.orgId, ctx.orgId)));
    return { ok: true };
  }),

  listDeleted: adminProcedure.query(({ ctx }) =>
    db.select().from(pipes).where(and(eq(pipes.orgId, ctx.orgId), isNotNull(pipes.deletedAt))).orderBy(desc(pipes.deletedAt))
  ),

  restore: adminProcedure.input(z.object({ pipeId: z.string() })).mutation(async ({ ctx, input }) => {
    await db.update(pipes).set({ deletedAt: null }).where(and(eq(pipes.id, input.pipeId), eq(pipes.orgId, ctx.orgId)));
    return { ok: true };
  }),
});
