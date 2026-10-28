// Checks for automation helpers that need no database. Run: npm run -w server test:automations
// automations.ts imports the DB client, which validates env at import: give it dummies (no connection is made).
Object.assign(process.env, { DB_USER: "x", DB_PASSWORD: "x", DB_NAME: "x", GOOGLE_CLIENT_ID: "x", GOOGLE_CLIENT_SECRET: "x", PUBLIC_BASE_URL: "http://localhost", APP_ORIGIN: "http://localhost", SESSION_SECRET: "x".repeat(32) });
const { dueSlot, isInternalIp } = await import("../src/automations.js");
let fail = 0;
const t = (name: string, got: unknown, exp: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(exp); if (!ok) fail++; console.log(ok ? "ok   " : "FALHA", name, ok ? "" : `got=${JSON.stringify(got)} exp=${JSON.stringify(exp)}`); };
// 2026-10-28 (quarta) 11:30 UTC = 08:30 em Brasília
const now = new Date("2026-10-28T11:30:00Z");
t("hourly: slot da hora de Brasília", dueSlot({ type: "scheduled", frequency: "hourly" }, now), "2026-10-28T08");
t("daily antes do horário", dueSlot({ type: "scheduled", frequency: "daily", time: "09:00" }, now), null);
t("daily depois do horário", dueSlot({ type: "scheduled", frequency: "daily", time: "08:00" }, now), "2026-10-28");
t("weekly quarta (3)", dueSlot({ type: "scheduled", frequency: "weekly", time: "08:00", weekdays: [3] }, now), "2026-10-28");
t("weekly segunda (1) não", dueSlot({ type: "scheduled", frequency: "weekly", time: "08:00", weekdays: [1] }, now), null);
// 02:30 UTC do dia 29 = 23:30 do dia 28 em Brasília
t("virada do dia em UTC ainda é dia 28 em BRT", dueSlot({ type: "scheduled", frequency: "daily", time: "23:00" }, new Date("2026-10-29T02:30:00Z")), "2026-10-28");
for (const ip of ["127.0.0.1", "10.0.0.5", "192.168.1.1", "172.16.0.1", "172.31.255.1", "169.254.169.254", "::1", "fd00::1", "fe80::1", "0.0.0.0"]) t(`bloqueia ${ip}`, isInternalIp(ip), true);
for (const ip of ["8.8.8.8", "172.32.0.1", "200.147.67.142", "2804:14c::1"]) t(`permite ${ip}`, isInternalIp(ip), false);
console.log(fail ? `${fail} FALHA(S)` : "TODOS OK");
process.exit(fail ? 1 : 0);
