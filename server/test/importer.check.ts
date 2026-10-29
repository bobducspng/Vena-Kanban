// Cell conversions of the spreadsheet import (no database): npx tsx test/importer.check.ts
import { toBool, toDate, toNumber, toTime } from "../src/importer.js";

let bad = 0;
const eq = (got: unknown, want: unknown, what: string) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log("FALHOU", what, "->", got, "esperado", want); } };
eq(toNumber("1.234,56"), 1234.56, "1.234,56");
eq(toNumber("R$ 10,5"), 10.5, "R$ 10,5");
eq(toNumber("1234.56"), 1234.56, "1234.56");
eq(toNumber("1,234.56"), 1234.56, "1,234.56");
eq(toNumber("1.234"), 1234, "1.234 (milhar)");
eq(toNumber(42), 42, "42");
eq(toNumber("abc"), null, "abc");
eq(toDate("29/10/2026", false), "2026-10-29", "dd/mm/aaaa");
eq(toDate("29/10/26", false), "2026-10-29", "dd/mm/aa");
eq(toDate("2026-10-29", false), "2026-10-29", "iso");
eq(toDate("31/02/2026", false), null, "31/02 inválido");
eq(toDate("29/10/2026 14:30", true), "2026-10-29T14:30", "data e hora");
eq(toDate("2026-10-29T08:05", true), "2026-10-29T08:05", "iso com hora");
eq(toDate(46324, false), "2026-10-29", "serial do Excel");
eq(toTime("8:05"), "08:05", "8:05");
eq(toTime(0.5), "12:00", "fração do dia");
eq(toTime("25:00"), null, "25:00");
eq(toBool("Sim"), true, "Sim"); eq(toBool("não"), false, "não"); eq(toBool("x"), true, "x"); eq(toBool("talvez"), null, "talvez");
console.log(bad ? `${bad} FALHA(S)` : "TODOS OK");
process.exit(bad ? 1 : 0);
