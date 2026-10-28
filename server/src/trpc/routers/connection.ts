import { z } from "zod";
import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../../db/client.js";
import { fields } from "../../db/schema.js";
import { router, protectedProcedure, assertPipeInOrg } from "../trpc.js";
import { describe, readSettings, search } from "../../connections.js";

/** A "Conexão" field of a pipe in the caller's org, with its settings. */
async function connectionField(fieldId: string, orgId: string) {
  const f = (await db.select().from(fields).where(eq(fields.id, fieldId)).limit(1))[0];
  if (!f || f.type !== "connection") throw new TRPCError({ code: "NOT_FOUND", message: "Campo de conexão não encontrado" });
  await assertPipeInOrg(f.pipeId, orgId);
  const s = readSettings(f.settings);
  if (!s) throw new TRPCError({ code: "BAD_REQUEST", message: "Conexão sem configuração" });
  return s;
}

export const connectionRouter = router({
  /** Records/cards of the target matching `q` (title, or #number for cards). */
  search: protectedProcedure.input(z.object({ fieldId: z.string(), q: z.string().max(200).default("") })).query(async ({ ctx, input }) => {
    const s = await connectionField(input.fieldId, ctx.orgId);
    if (!s.canSearch) return [];
    return search(s, input.q);
  }),

  /** Title + summary of connected items, for showing them on the card. */
  describe: protectedProcedure.input(z.object({ fieldId: z.string(), ids: z.array(z.string()).max(200) })).query(async ({ ctx, input }) => {
    const s = await connectionField(input.fieldId, ctx.orgId);
    return describe(s, input.ids);
  }),
});
