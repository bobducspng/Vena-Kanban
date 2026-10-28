// Checks for the conditionals evaluator. Run: npm run -w server test:conditions
import { evalRule, evalExpression, fieldStates, mustFill, type ConditionDef } from "../src/conditions.js";
let fail = 0;
const t = (name: string, got: unknown, exp: unknown) => { const ok = JSON.stringify(got) === JSON.stringify(exp); if (!ok) fail++; console.log(ok ? "ok   " : "FALHA", name, ok ? "" : `got=${JSON.stringify(got)} exp=${JSON.stringify(exp)}`); };
// 2026-10-28 15:00 UTC = 12:00 Brasília (quarta-feira)
const now = new Date("2026-10-28T15:00:00Z");
t("equals texto (case-insensitive)", evalRule({ fieldId: "a", operator: "equals", value: "Outro" }, "outro", now), true);
t("equals lista contém", evalRule({ fieldId: "a", operator: "equals", value: "B" }, ["A", "B"], now), true);
t("not_equals lista", evalRule({ fieldId: "a", operator: "not_equals", value: "C" }, ["A", "B"], now), true);
t("equals número", evalRule({ fieldId: "a", operator: "equals", value: "1000" }, 1000, now), true);
t("equals booleano", evalRule({ fieldId: "a", operator: "equals", value: "true" }, true, now), true);
t("maior que", evalRule({ fieldId: "a", operator: "number_greater_than", value: 1000 }, 1500, now), true);
t("maior que vazio=false", evalRule({ fieldId: "a", operator: "number_greater_than", value: 0 }, null, now), false);
t("contém", evalRule({ fieldId: "a", operator: "string_contains", value: "urg" }, "Muito URGENTE", now), true);
t("blank lista vazia", evalRule({ fieldId: "a", operator: "blank" }, [], now), true);
t("hoje (BRT)", evalRule({ fieldId: "a", operator: "date_is_today" }, "2026-10-28", now), true);
// 01:00 UTC do dia 29 = 22:00 do dia 28 em Brasília: ainda é "hoje" = 28
t("hoje perto da meia-noite UTC", evalRule({ fieldId: "a", operator: "date_is_today" }, "2026-10-28", new Date("2026-10-29T01:00:00Z")), true);
t("ontem", evalRule({ fieldId: "a", operator: "date_is_yesterday" }, "2026-10-27", now), true);
t("semana atual (seg 26)", evalRule({ fieldId: "a", operator: "date_in_current_week" }, "2026-10-26", now), true);
t("semana atual (dom 25 = passada)", evalRule({ fieldId: "a", operator: "date_in_current_week" }, "2026-10-25", now), false);
t("semana passada (dom 25)", evalRule({ fieldId: "a", operator: "date_in_last_week" }, "2026-10-25", now), true);
t("mês passado", evalRule({ fieldId: "a", operator: "date_in_last_month" }, "2026-09-30", now), true);
t("datetime-local depois de", evalRule({ fieldId: "a", operator: "date_is_after", value: "2026-10-01" }, "2026-10-02T08:00", now), true);
// E dentro do grupo, OU entre grupos
const g = [[{ fieldId: "v", operator: "number_greater_than" as const, value: 1000 }, { fieldId: "ap", operator: "not_equals" as const, value: "Sim" }],
           [{ fieldId: "area", operator: "equals" as const, value: "Engenharia" }]];
t("E/OU: grupo 1 verdadeiro", evalExpression(g, { v: 2000, ap: "Não", area: "RH" }, now), true);
t("E/OU: grupo 2 verdadeiro", evalExpression(g, { v: 10, ap: "Sim", area: "Engenharia" }, now), true);
t("E/OU: nenhum", evalExpression(g, { v: 2000, ap: "Sim", area: "RH" }, now), false);
// Estado: "Qual?" oculto até Tipo = Outro; "Justificativa" vira obrigatória se valor > 1000
const fields = [{ id: "tipo", phaseId: "p", required: true }, { id: "qual", phaseId: "p", required: true }, { id: "just", phaseId: "p", required: false }];
const conds: ConditionDef[] = [
  { id: "c1", phaseId: "p", position: 0, groups: [[{ fieldId: "tipo", operator: "equals", value: "Outro" }]], onTrue: [{ fieldId: "qual", action: "show" }], onFalse: [] },
  { id: "c2", phaseId: "p", position: 1, groups: [[{ fieldId: "valor", operator: "number_greater_than", value: 1000 }]], onTrue: [{ fieldId: "just", action: "require" }], onFalse: [] },
];
const s1 = fieldStates(fields, conds, { tipo: "Compra", valor: 500 }, now);
t("qual oculto e não cobrado", [s1.get("qual")!.visible, mustFill(s1.get("qual"))], [false, false]);
t("just opcional", mustFill(s1.get("just")), false);
const s2 = fieldStates(fields, conds, { tipo: "outro", valor: 5000 }, now);
t("qual aparece e é cobrado", [s2.get("qual")!.visible, mustFill(s2.get("qual"))], [true, true]);
t("just vira obrigatório", mustFill(s2.get("just")), true);
// The front-end keeps a copy of the evaluator: bodies must match (header comment aside).
{
  const { readFileSync } = await import("node:fs");
  const body = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n").split("\n").slice(5).join("\n");
  t("cópia do front idêntica", body("../src/conditions.ts") === body("../../app/src/lib/conditions.ts"), true);
}
console.log(fail ? `${fail} FALHA(S)` : "TODOS OK");
if (fail) process.exit(1);
