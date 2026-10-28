// Checks for business-time arithmetic. Run: npm run -w server test:business
import { addBusinessMinutes, businessMinutesBetween, nationalHolidays, DEFAULT_CALENDAR } from "../src/businessTime.js";
let fail = 0;
const t = (name: string, got: unknown, exp: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(exp); if (!ok) fail++; console.log(ok ? "ok   " : "FALHA", name, ok ? "" : `got=${JSON.stringify(got)} exp=${JSON.stringify(exp)}`); };
// Brasília = UTC−3. "BRT(h)" helper: 2026-10-DD HH:MM Brasília → Date.
const brt = (s: string) => new Date(`${s}:00-03:00`);
const iso = (d: Date) => d.toISOString();
const cal = { ...DEFAULT_CALENDAR, holidays: ["2026-11-02"] }; // Finados (segunda)
// 2026-10-28 = quarta
t("4h úteis dentro do dia", iso(addBusinessMinutes(brt("2026-10-28T09:00"), 240, cal)), iso(brt("2026-10-28T13:00")));
t("passa para o dia seguinte", iso(addBusinessMinutes(brt("2026-10-28T16:00"), 180, cal)), iso(brt("2026-10-29T09:00")));
t("antes do expediente começa às 8h", iso(addBusinessMinutes(brt("2026-10-28T06:00"), 60, cal)), iso(brt("2026-10-28T09:00")));
t("depois do expediente vai para amanhã", iso(addBusinessMinutes(brt("2026-10-28T20:00"), 60, cal)), iso(brt("2026-10-29T09:00")));
// sexta 17:00 + 2h → segunda 09:00, mas segunda 02/11 é feriado → terça 03/11 09:00
t("pula fim de semana e feriado", iso(addBusinessMinutes(brt("2026-10-30T17:00"), 120, cal)), iso(brt("2026-11-03T09:00")));
t("1 dia útil (600 min) de quarta 10h", iso(addBusinessMinutes(brt("2026-10-28T10:00"), 600, cal)), iso(brt("2026-10-29T10:00")));
t("sem calendário = minutos corridos", iso(addBusinessMinutes(brt("2026-10-30T17:00"), 120, null)), iso(brt("2026-10-30T19:00")));
t("minutos úteis no mesmo dia", businessMinutesBetween(brt("2026-10-28T09:00"), brt("2026-10-28T12:30"), cal), 210);
t("minutos úteis sexta→terça (feriado)", businessMinutesBetween(brt("2026-10-30T17:00"), brt("2026-11-03T09:00"), cal), 120);
t("minutos úteis noite→manhã", businessMinutesBetween(brt("2026-10-28T19:00"), brt("2026-10-29T08:30"), cal), 30);
const h26 = nationalHolidays(2026);
t("2026 tem 10 feriados nacionais", h26.length, 10);
t("Sexta-feira Santa 2026 = 03/04", h26.find((h) => h.name === "Sexta-feira Santa")?.date, "2026-04-03");
t("Sexta-feira Santa 2027 = 26/03", nationalHolidays(2027).find((h) => h.name === "Sexta-feira Santa")?.date, "2027-03-26");
t("Consciência Negra incluída", h26.some((h) => h.date === "2026-11-20"), true);
console.log(fail ? `${fail} FALHA(S)` : "TODOS OK");
process.exit(fail ? 1 : 0);
