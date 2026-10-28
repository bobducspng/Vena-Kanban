import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "./db/client.js";
import { businessCalendars, cardAssignees, cardEvents, cardPhaseHistory, cards, phases, pipes } from "./db/schema.js";
import { notifyAlert } from "./notify.js";
import { addBusinessMinutes, DEFAULT_CALENDAR, nationalHolidays, type Calendar } from "./businessTime.js";
import { announceHappening } from "./cardService.js";

/**
 * Alerts (M6), as in the original — three independent clocks:
 *  - atrasado (late): time in the current phase > the phase SLA;
 *  - expirado (expired): time since creation > the pipe deadline, until an end phase;
 *  - vencido (overdue): the card's due date has passed.
 * Pipes may count SLA/deadline in business time (org calendar). Once raised, an alert
 * stays: changing the SLA later does not clear it (original rule). Moving to another
 * phase starts a new phase clock (late clears; expiration does not).
 */

export interface StoredCalendar { weekdays: number[]; startTime: string; endTime: string; holidays: { date: string; name: string }[] }

/** National holidays of this year and the next (default list). */
export function defaultHolidays(now = new Date()) {
  const y = now.getUTCFullYear();
  return [...nationalHolidays(y), ...nationalHolidays(y + 1)];
}

/** The org's calendar as stored (or the default: Mon–Fri 08–18 + national holidays). */
export async function storedCalendar(orgId: string): Promise<StoredCalendar> {
  const row = (await db.select().from(businessCalendars).where(eq(businessCalendars.orgId, orgId)).limit(1))[0];
  if (!row) return { weekdays: DEFAULT_CALENDAR.weekdays, startTime: DEFAULT_CALENDAR.start, endTime: DEFAULT_CALENDAR.end, holidays: defaultHolidays() };
  return { weekdays: row.weekdays as number[], startTime: row.startTime, endTime: row.endTime, holidays: row.holidays as StoredCalendar["holidays"] };
}

const cache = new Map<string, { at: number; cal: Calendar }>();
/** Calendar for arithmetic (cached for a minute). */
export async function calendarOf(orgId: string): Promise<Calendar> {
  const hit = cache.get(orgId);
  if (hit && Date.now() - hit.at < 60_000) return hit.cal;
  const s = await storedCalendar(orgId);
  const cal = { weekdays: s.weekdays, start: s.startTime, end: s.endTime, holidays: s.holidays.map((h) => h.date) };
  cache.set(orgId, { at: Date.now(), cal });
  return cal;
}
export const forgetCalendar = (orgId: string) => cache.delete(orgId);

/** Cards created before M6 have no phase clock: start it at their last move (or creation). */
async function backfill() {
  const missing = await db.select({ id: cards.id, createdAt: cards.createdAt, phaseId: cards.currentPhaseId }).from(cards)
    .where(and(isNull(cards.phaseEnteredAt), isNull(cards.deletedAt))).limit(500);
  for (const c of missing) {
    const lastMove = (await db.select({ at: cardEvents.createdAt }).from(cardEvents)
      .where(and(eq(cardEvents.cardId, c.id), eq(cardEvents.type, "moved"))).orderBy(desc(cardEvents.createdAt)).limit(1))[0];
    const at = lastMove?.at ?? c.createdAt;
    await db.update(cards).set({ phaseEnteredAt: at }).where(eq(cards.id, c.id));
    const open = (await db.select({ id: cardPhaseHistory.id }).from(cardPhaseHistory).where(and(eq(cardPhaseHistory.cardId, c.id), isNull(cardPhaseHistory.leftAt))).limit(1))[0];
    if (!open) await db.insert(cardPhaseHistory).values({ id: crypto.randomUUID(), cardId: c.id, phaseId: c.phaseId, enteredAt: at });
  }
}

async function raise(cardId: string, pipeId: string, phaseId: string, kind: "late" | "expired" | "overdue") {
  const label = { late: "Card atrasado na fase", expired: "Card expirado (prazo do pipe)", overdue: "Card vencido" }[kind];
  await db.insert(cardEvents).values({ id: crypto.randomUUID(), cardId, type: kind, actorId: null, data: { alert: label } });
  const people = (await db.select({ userId: cardAssignees.userId }).from(cardAssignees).where(eq(cardAssignees.cardId, cardId))).map((a) => a.userId);
  await notifyAlert(people, cardId, kind);
  await announceHappening({ kind: "alert", alertKind: kind, cardId, pipeId, phaseId, depth: 0 });
}

/** Once a minute: raise the alerts whose time has come. */
export async function sweepAlerts(now = new Date()) {
  await backfill();
  const open = await db.select({
    id: cards.id, pipeId: cards.pipeId, phaseId: cards.currentPhaseId, createdAt: cards.createdAt, dueDate: cards.dueDate,
    phaseEnteredAt: cards.phaseEnteredAt, lateAt: cards.lateAt, expiredAt: cards.expiredAt, overdueAt: cards.overdueAt,
    sla: phases.slaMinutes, expiration: pipes.expirationMinutes, business: pipes.businessHoursOnly, orgId: pipes.orgId,
  })
    .from(cards).innerJoin(phases, eq(phases.id, cards.currentPhaseId)).innerJoin(pipes, eq(pipes.id, cards.pipeId))
    .where(and(eq(cards.done, false), isNull(cards.deletedAt), isNull(pipes.deletedAt),
      sql`(${cards.lateAt} IS NULL OR ${cards.expiredAt} IS NULL OR ${cards.overdueAt} IS NULL)`));

  for (const c of open) {
    const cal = c.business ? await calendarOf(c.orgId) : null;
    if (!c.lateAt && c.sla && c.phaseEnteredAt && addBusinessMinutes(c.phaseEnteredAt, c.sla, cal) <= now) {
      await db.update(cards).set({ lateAt: now, late: true }).where(eq(cards.id, c.id));
      await db.update(cardPhaseHistory).set({ becameLate: true }).where(and(eq(cardPhaseHistory.cardId, c.id), isNull(cardPhaseHistory.leftAt)));
      await raise(c.id, c.pipeId, c.phaseId, "late");
    }
    if (!c.expiredAt && c.expiration && addBusinessMinutes(c.createdAt, c.expiration, cal) <= now) {
      await db.update(cards).set({ expiredAt: now }).where(eq(cards.id, c.id));
      await raise(c.id, c.pipeId, c.phaseId, "expired");
    }
    if (!c.overdueAt && c.dueDate && c.dueDate <= now) {
      await db.update(cards).set({ overdueAt: now }).where(eq(cards.id, c.id));
      await raise(c.id, c.pipeId, c.phaseId, "overdue");
    }
  }
}

/** Deadlines of a card right now (for the card view): when it will be late / expire. */
export async function deadlinesOf(cardId: string) {
  const c = (await db.select({
    phaseEnteredAt: cards.phaseEnteredAt, createdAt: cards.createdAt, done: cards.done,
    sla: phases.slaMinutes, expiration: pipes.expirationMinutes, business: pipes.businessHoursOnly, orgId: pipes.orgId,
  }).from(cards).innerJoin(phases, eq(phases.id, cards.currentPhaseId)).innerJoin(pipes, eq(pipes.id, cards.pipeId))
    .where(eq(cards.id, cardId)).limit(1))[0];
  if (!c) return null;
  const cal = c.business ? await calendarOf(c.orgId) : null;
  return {
    lateBy: c.sla && c.phaseEnteredAt ? addBusinessMinutes(c.phaseEnteredAt, c.sla, cal) : null,
    expiresBy: c.expiration && !c.done ? addBusinessMinutes(c.createdAt, c.expiration, cal) : null,
    businessHours: c.business,
  };
}
