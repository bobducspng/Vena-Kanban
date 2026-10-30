// Which operations show "Configuração salva": npx tsx test/configSaved.check.ts
import { readFileSync } from "node:fs";
const src = readFileSync(new URL("../src/lib/trpc.ts", import.meta.url), "utf8");
const body = src.slice(src.indexOf("const CONFIG = new RegExp("), src.indexOf("export const CONFIG_SAVED_EVENT"));
const CONFIG: RegExp = new Function(`${body.replace("const CONFIG =", "return")}`)();
let bad = 0;
const yes = ["field.create", "field.update", "phase.update", "pipe.update", "automation.update", "email.createTemplate", "people.saveGroup", "database.setAccess", "calendar.update", "letterhead.setDefault"];
const no = ["card.updateField", "card.move", "comment.create", "email.send", "pdf.generate", "database.updateRecordValue", "automation.test", "calendar.nationalHolidays", "pipeXupdate", "notification.markRead", "importer.cards"];
for (const p of yes) if (!CONFIG.test(p)) { bad++; console.log("deveria avisar:", p); }
for (const p of no) if (CONFIG.test(p)) { bad++; console.log("não deveria avisar:", p); }
console.log(bad ? `${bad} FALHA(S)` : "TODOS OK");
process.exit(bad ? 1 : 0);
