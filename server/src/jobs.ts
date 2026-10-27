// Background job runner (second systemd service). On a single VM there is no
// Vercel Cron — a long-lived process ticks here. For now it only sweeps due
// dates; the automation engine (schedule/alert events) plugs in at the marked
// point during the automations milestone.
//
// Kept dependency-free (setInterval) so it needs nothing beyond Node. Swap for
// node-cron if you want cron expressions.
import { lte, eq, and } from "drizzle-orm";
import { db, pool } from "./db/client.js";
import { cards } from "./db/schema.js";

const MINUTE = 60 * 1000;

async function sweepDueDates() {
  const now = new Date();
  // Mark overdue, not-done cards as late.
  await db.update(cards).set({ late: true })
    .where(and(lte(cards.dueDate, now), eq(cards.done, false), eq(cards.late, false)));
  // TODO(automations): evaluate schedule/alert automations here, writing an
  // automation_runs row with a dedupe_key before each action (idempotency).
}

async function tick() {
  try {
    await sweepDueDates();
  } catch (err) {
    console.error("job tick failed:", err);
  }
}

console.log("Job runner started.");
void tick();
const timer = setInterval(() => void tick(), MINUTE);

async function shutdown() {
  clearInterval(timer);
  await pool.end();
  process.exit(0);
}
process.on("SIGTERM", () => void shutdown());
process.on("SIGINT", () => void shutdown());
