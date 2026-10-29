import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../../db/client.js";
import { dataTables } from "../../db/schema.js";
import { router, adminProcedure, assertPipeInOrg } from "../trpc.js";
import { importCards, importRecords } from "../../importer.js";

// One batch of spreadsheet rows (the browser sends up to 100 at a time).
const batch = {
  mapping: z.array(z.string().nullable()).max(200),
  rows: z.array(z.array(z.union([z.string().max(20_000), z.number(), z.boolean(), z.null()])).max(200)).max(100),
  firstRow: z.number().int().min(1),
  dryRun: z.boolean(),
};

/** Importar planilha (admins): cards of a pipe or records of a banco de dados. */
export const importerRouter = router({
  cards: adminProcedure.input(z.object({ pipeId: z.string(), runAutomations: z.boolean().default(false), ...batch })).mutation(async ({ ctx, input }) => {
    await assertPipeInOrg(input.pipeId, ctx.orgId);
    return importCards({ ...input, orgId: ctx.orgId, userId: ctx.userId });
  }),
  records: adminProcedure.input(z.object({ tableId: z.string(), ...batch })).mutation(async ({ ctx, input }) => {
    const t = (await db.select().from(dataTables).where(eq(dataTables.id, input.tableId)).limit(1))[0];
    if (!t || t.orgId !== ctx.orgId || t.deletedAt) throw new TRPCError({ code: "NOT_FOUND", message: "Banco de dados não encontrado" });
    return importRecords({ ...input, titleFieldId: t.titleFieldId, orgId: ctx.orgId, userId: ctx.userId });
  }),
});
