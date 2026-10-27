import { migrate } from "drizzle-orm/mysql2/migrator";
import { db, pool } from "./client.js";

// Applies the generated migrations in ./drizzle to the configured database.
// Run on the VM after `npm run db:generate`: `npm run db:migrate`.
async function main() {
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("Migrations applied.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
