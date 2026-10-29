import { z } from "zod";
import { and, eq, gte, inArray, isNull } from "drizzle-orm";
import { db } from "../../db/client.js";
import { cardAssignees, cardPhaseHistory, cards, phases, pipes, users } from "../../db/schema.js";
import { router, protectedProcedure, assertPipeInOrg } from "../trpc.js";
import { calendarOf } from "../../slaService.js";
import { businessMinutesBetween } from "../../businessTime.js";

const DAY = 86_400_000;
const WEEKS = 12;
const BRT = 3 * 3_600_000; // Brasília = UTC−3

/** Monday 00:00 (Brasília) of the week containing `t`, as a UTC instant. */
const weekStart = (t: number) => {
  const local = t - BRT;
  const day = Math.floor(local / DAY);
  const dow = (new Date(day * DAY).getUTCDay() + 6) % 7; // Monday = 0
  return (day - dow) * DAY + BRT;
};

/** Pipe dashboard: KPIs, open cards per phase, time per phase, weekly throughput, load per person. */
export const dashboardRouter = router({
  pipe: protectedProcedure.input(z.object({ pipeId: z.string(), days: z.number().int().min(7).max(365).default(90) })).query(async ({ ctx, input }) => {
    await assertPipeInOrg(input.pipeId, ctx.orgId);
    const now = Date.now();
    const since = new Date(now - input.days * DAY);
    const pipe = (await db.select({ business: pipes.businessHoursOnly }).from(pipes).where(eq(pipes.id, input.pipeId)).limit(1))[0];
    const cal = pipe?.business ? await calendarOf(ctx.orgId) : null;
    const phaseRows = await db.select({ id: phases.id, name: phases.name, color: phases.color, position: phases.position, isEnd: phases.isEnd })
      .from(phases).where(eq(phases.pipeId, input.pipeId));
    phaseRows.sort((a, b) => a.position - b.position);
    const endIds = new Set(phaseRows.filter((p) => p.isEnd).map((p) => p.id));
    const all = await db.select({ id: cards.id, phaseId: cards.currentPhaseId, done: cards.done, createdAt: cards.createdAt, lateAt: cards.lateAt, expiredAt: cards.expiredAt, overdueAt: cards.overdueAt })
      .from(cards).where(and(eq(cards.pipeId, input.pipeId), isNull(cards.deletedAt)));
    const open = all.filter((c) => !c.done);
    const ids = all.map((c) => c.id);

    // Stays: completed ones inside the period feed "tempo médio por fase"; entries into an
    // end phase feed "concluídos" and lead time.
    const stays = ids.length ? await db.select().from(cardPhaseHistory)
      .where(and(inArray(cardPhaseHistory.cardId, ids), gte(cardPhaseHistory.enteredAt, new Date(Math.min(since.getTime(), weekStart(now) - (WEEKS - 1) * 7 * DAY))))) : [];
    const created = new Map(all.map((c) => [c.id, c.createdAt.getTime()]));
    const finishes = stays.filter((s) => endIds.has(s.phaseId));
    // A card concluded more than once (reopened) counts by its latest conclusion.
    const lastFinish = new Map<string, number>();
    for (const f of finishes) lastFinish.set(f.cardId, Math.max(lastFinish.get(f.cardId) ?? 0, f.enteredAt.getTime()));
    const doneInPeriod = [...lastFinish].filter(([, t]) => t >= since.getTime());
    const leadDays = doneInPeriod.map(([id, t]) => (t - (created.get(id) ?? t)) / DAY);

    const timeInPhase = phaseRows.filter((p) => !p.isEnd).map((p) => {
      const closed = stays.filter((s) => s.phaseId === p.id && s.leftAt && s.leftAt.getTime() >= since.getTime());
      const mins = closed.map((s) => businessMinutesBetween(s.enteredAt, s.leftAt!, cal));
      return { phaseId: p.id, name: p.name, avgMinutes: mins.length ? Math.round(mins.reduce((a, b) => a + b, 0) / mins.length) : null, samples: mins.length };
    });

    const weeks = Array.from({ length: WEEKS }, (_, i) => weekStart(now) - (WEEKS - 1 - i) * 7 * DAY);
    const bucket = (t: number) => weeks.findIndex((w, i) => t >= w && t < (weeks[i + 1] ?? Infinity));
    const createdW = new Array(WEEKS).fill(0), doneW = new Array(WEEKS).fill(0);
    for (const c of all) { const i = bucket(c.createdAt.getTime()); if (i >= 0) createdW[i]++; }
    for (const [, t] of lastFinish) { const i = bucket(t); if (i >= 0) doneW[i]++; }

    const asg = open.length ? await db.select({ cardId: cardAssignees.cardId, userId: cardAssignees.userId, name: users.name, email: users.email })
      .from(cardAssignees).innerJoin(users, eq(users.id, cardAssignees.userId)).where(inArray(cardAssignees.cardId, open.map((c) => c.id))) : [];
    const people = new Map<string, { name: string; open: number; late: number }>();
    for (const a of asg) {
      const p = people.get(a.userId) ?? { name: a.name ?? a.email, open: 0, late: 0 };
      p.open++;
      const c = open.find((x) => x.id === a.cardId);
      if (c && (c.lateAt || c.expiredAt || c.overdueAt)) p.late++;
      people.set(a.userId, p);
    }

    return {
      days: input.days,
      businessHours: !!cal,
      kpis: {
        open: open.length,
        done: doneInPeriod.length,
        leadTimeDays: leadDays.length ? Math.round((leadDays.reduce((a, b) => a + b, 0) / leadDays.length) * 10) / 10 : null,
        late: open.filter((c) => c.lateAt).length,
        expired: open.filter((c) => c.expiredAt).length,
        overdue: open.filter((c) => c.overdueAt).length,
      },
      byPhase: phaseRows.map((p) => ({ phaseId: p.id, name: p.name, isEnd: p.isEnd, open: open.filter((c) => c.phaseId === p.id).length, late: open.filter((c) => c.phaseId === p.id && c.lateAt).length })),
      timeInPhase,
      weekly: weeks.map((w, i) => ({ weekStart: new Date(w).toISOString(), created: createdW[i], done: doneW[i] })),
      byPerson: [...people.values()].sort((a, b) => b.open - a.open),
      unassigned: open.length - new Set(asg.map((a) => a.cardId)).size,
    };
  }),
});
