import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { db } from "../../db/client.js";
import { businessCalendars } from "../../db/schema.js";
import { router, protectedProcedure, adminProcedure } from "../trpc.js";
import { defaultHolidays, forgetCalendar, storedCalendar } from "../../slaService.js";

const hm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const holiday = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), name: z.string().trim().min(1).max(120) });

/** Expediente + feriados of the organisation (used by SLAs counted in business time). */
export const calendarRouter = router({
  get: protectedProcedure.query(({ ctx }) => storedCalendar(ctx.orgId)),

  update: adminProcedure
    .input(z.object({ weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7), startTime: hm, endTime: hm, holidays: z.array(holiday).max(500) }))
    .mutation(async ({ ctx, input }) => {
      if (input.endTime <= input.startTime) throw new TRPCError({ code: "BAD_REQUEST", message: "O fim do expediente precisa ser depois do início." });
      const holidays = [...new Map(input.holidays.map((h) => [h.date, h])).values()].sort((a, b) => a.date.localeCompare(b.date));
      const row = { weekdays: [...new Set(input.weekdays)].sort(), startTime: input.startTime, endTime: input.endTime, holidays };
      await db.insert(businessCalendars).values({ orgId: ctx.orgId, ...row }).onDuplicateKeyUpdate({ set: row });
      forgetCalendar(ctx.orgId);
      return storedCalendar(ctx.orgId);
    }),

  /** National holidays of this year and the next, to merge into the list. */
  nationalHolidays: adminProcedure.query(() => defaultHolidays()),
});
