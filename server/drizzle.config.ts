import { defineConfig } from "drizzle-kit";

// `drizzle-kit generate` reads the schema and writes SQL migrations to ./drizzle
// (no DB connection needed). `migrate` / `push` use the credentials below.
export default defineConfig({
  dialect: "mysql",
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER ?? "root",
    password: process.env.DB_PASSWORD ?? "",
    database: process.env.DB_NAME ?? "replica",
  },
});
