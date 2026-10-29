import { db } from "./db/client.js";
import { auditLog } from "./db/schema.js";

const MAX = 4000;
// Never keep credentials in the log (e.g. headers of an HTTP automation).
const SECRET = /token|password|senha|secret|authorization|api[-_]?key/i;

function redact(v: unknown, depth = 0): unknown {
  if (depth > 8 || v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map((x) => redact(x, depth + 1));
  return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, SECRET.test(k) ? "•••" : redact(x, depth + 1)]));
}

/** One line of the audit log: who changed which configuration, with what. */
export async function recordAudit(orgId: string, userId: string, action: string, input: unknown) {
  let json = input === undefined ? null : JSON.stringify(redact(input));
  if (json && json.length > MAX) json = json.slice(0, MAX) + "…";
  await db.insert(auditLog).values({ id: crypto.randomUUID(), orgId, userId, action, input: json });
}
