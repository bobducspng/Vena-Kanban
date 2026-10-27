import mysql from "mysql2/promise";
import { drizzle } from "drizzle-orm/mysql2";
import { env } from "../env.js";
import * as schema from "./schema.js";

/** One connection pool, one Drizzle instance. Times stored/compared in UTC. */
export const pool = mysql.createPool({
  host: env.DB_HOST,
  port: env.DB_PORT,
  user: env.DB_USER,
  password: env.DB_PASSWORD,
  database: env.DB_NAME,
  connectionLimit: 10,
  timezone: "Z",
});

export const db = drizzle(pool, { schema, mode: "default" });
export type DB = typeof db;
