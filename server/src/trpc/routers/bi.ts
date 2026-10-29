import { eq } from "drizzle-orm";
import { db } from "../../db/client.js";
import { biFeeds } from "../../db/schema.js";
import { router, adminProcedure } from "../trpc.js";
import { newToken } from "../../publicForms.js";
import { biUrl } from "../../bi.js";

/** Admins: the Power BI feed key of the organisation (create / replace / turn off). */
export const biRouter = router({
  get: adminProcedure.query(async ({ ctx }) => {
    const f = (await db.select().from(biFeeds).where(eq(biFeeds.orgId, ctx.orgId)).limit(1))[0];
    return f ? { url: biUrl(f.token), createdAt: f.createdAt } : null;
  }),
  /** New key: links with the old one stop working. */
  regenerate: adminProcedure.mutation(async ({ ctx }) => {
    const token = newToken();
    await db.insert(biFeeds).values({ orgId: ctx.orgId, token, createdBy: ctx.userId }).onDuplicateKeyUpdate({ set: { token, createdBy: ctx.userId, createdAt: new Date() } });
    return { url: biUrl(token) };
  }),
  disable: adminProcedure.mutation(async ({ ctx }) => {
    await db.delete(biFeeds).where(eq(biFeeds.orgId, ctx.orgId));
    return { ok: true };
  }),
});
