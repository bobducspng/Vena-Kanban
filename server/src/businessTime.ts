/**
 * Business-time arithmetic for SLAs, in Brasília time (America/Sao_Paulo, no DST
 * since 2019 — a fixed UTC−3 offset). Pure functions, no database.
 *
 * Calendar: working weekdays + daily window (e.g. Mon–Fri 08:00–18:00) + holidays.
 * `addBusinessMinutes(start, n)` = the instant n minutes of working time after start.
 */

export interface Calendar {
  weekdays: number[]; // 0 = domingo … 6 = sábado
  start: string; // "08:00"
  end: string; // "18:00"
  holidays: string[]; // "YYYY-MM-DD"
}

export const DEFAULT_CALENDAR: Calendar = { weekdays: [1, 2, 3, 4, 5], start: "08:00", end: "18:00", holidays: [] };

const OFFSET_MS = 3 * 3_600_000; // Brasília = UTC−3
const MIN = 60_000;
const DAY = 86_400_000;
const toMin = (hm: string) => { const [h, m] = hm.split(":").map(Number); return h * 60 + m; };

/** Local (Brasília) day number and minute-of-day for an instant. */
function local(t: number) {
  const l = t - OFFSET_MS;
  return { day: Math.floor(l / DAY), minute: Math.floor((l % DAY) / MIN) };
}
const instant = (day: number, minute: number) => day * DAY + minute * MIN + OFFSET_MS;
const isoDay = (day: number) => new Date(day * DAY).toISOString().slice(0, 10);
const weekday = (day: number) => new Date(day * DAY).getUTCDay();

export function isWorkingDay(day: number, cal: Calendar) {
  return cal.weekdays.includes(weekday(day)) && !cal.holidays.includes(isoDay(day));
}

/** The instant `minutes` of working time after `from`. Without a calendar, plain minutes. */
export function addBusinessMinutes(from: Date, minutes: number, cal?: Calendar | null): Date {
  if (!cal) return new Date(from.getTime() + minutes * MIN);
  const open = toMin(cal.start), close = toMin(cal.end);
  if (close <= open || !cal.weekdays.length) return new Date(from.getTime() + minutes * MIN);
  let { day, minute } = local(from.getTime());
  let left = minutes;
  for (let guard = 0; guard < 20_000; guard++) {
    if (isWorkingDay(day, cal) && minute < close) {
      const startAt = Math.max(minute, open);
      const room = close - startAt;
      if (left <= room) return new Date(instant(day, startAt + left));
      left -= room;
    }
    day += 1;
    minute = 0;
  }
  throw new Error("calendário sem dias úteis suficientes");
}

/** Working minutes between two instants (for "tempo na fase" in business time). */
export function businessMinutesBetween(a: Date, b: Date, cal?: Calendar | null): number {
  if (b <= a) return 0;
  if (!cal) return Math.round((b.getTime() - a.getTime()) / MIN);
  const open = toMin(cal.start), close = toMin(cal.end);
  const s = local(a.getTime()), e = local(b.getTime());
  let total = 0;
  for (let day = s.day; day <= e.day; day++) {
    if (!isWorkingDay(day, cal)) continue;
    const from = Math.max(open, day === s.day ? s.minute : 0);
    const to = Math.min(close, day === e.day ? e.minute : 24 * 60);
    if (to > from) total += to - from;
  }
  return total;
}

/** Easter Sunday (Gregorian, anonymous algorithm) as "YYYY-MM-DD". */
function easter(y: number) {
  const a = y % 19, b = Math.floor(y / 100), c = y % 100, d = Math.floor(b / 4), e = b % 4;
  const f = Math.floor((b + 8) / 25), g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31), day = ((h + l - 7 * m + 114) % 31) + 1;
  return Date.UTC(y, month - 1, day);
}

/** Brazilian national holidays of a year (by law; Carnaval/Corpus Christi are optional, not included). */
export function nationalHolidays(y: number): { date: string; name: string }[] {
  const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
  const fixed: [string, string][] = [
    ["01-01", "Confraternização Universal"], ["04-21", "Tiradentes"], ["05-01", "Dia do Trabalho"],
    ["09-07", "Independência do Brasil"], ["10-12", "Nossa Senhora Aparecida"], ["11-02", "Finados"],
    ["11-15", "Proclamação da República"], ["11-20", "Dia Nacional de Zumbi e da Consciência Negra"], ["12-25", "Natal"],
  ];
  return [
    { date: iso(easter(y) - 2 * DAY), name: "Sexta-feira Santa" },
    ...fixed.map(([md, name]) => ({ date: `${y}-${md}`, name })),
  ].sort((p, q) => p.date.localeCompare(q.date));
}
