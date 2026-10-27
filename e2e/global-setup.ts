import { chromium } from "@playwright/test";
import { randomBytes } from "node:crypto";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { mkdirSync } from "node:fs";
import mysql from "mysql2/promise";
import dotenv from "dotenv";

const here = dirname(fileURLToPath(import.meta.url));

// Load the backend's .env so we hit the same MySQL the server uses.
dotenv.config({ path: resolve(here, "../server/.env") });

const SEED_EMAIL = process.env.E2E_USER_EMAIL ?? "ana@empresa.com";
const APP_URL = process.env.APP_URL ?? "http://localhost:5173";
const STATE = resolve(here, ".auth/state.json");

/**
 * Cria uma sessão válida para um usuário do seed e grava o cookie `sid`.
 * Contorna o Google OAuth (não automatizável) sem abrir buraco no backend:
 * escrevemos uma linha em `sessions`, exatamente como o fluxo real faria.
 */
export default async function globalSetup() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST ?? "127.0.0.1",
    port: Number(process.env.DB_PORT ?? 3306),
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    timezone: "Z",
  });

  const [rows] = await conn.execute(
    "SELECT id FROM users WHERE email = ? LIMIT 1",
    [SEED_EMAIL]
  );
  const user = (rows as { id: string }[])[0];
  if (!user) {
    await conn.end();
    throw new Error(
      `Usuário de teste ${SEED_EMAIL} não existe. Rode "npm run -w server db:seed" antes.`
    );
  }

  // Token no mesmo formato do backend: randomBytes(32).toString("hex") = 64 chars.
  const token = randomBytes(32).toString("hex");
  const expires = new Date(Date.now() + 1000 * 60 * 60 * 24); // 24h
  await conn.execute(
    "INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)",
    [token, user.id, expires]
  );
  await conn.end();

  // Cookie de domínio "localhost" (sem porta) → vale para :5173 e :4000,
  // que são o mesmo site; secure=false em dev. Igual ao que o server emite.
  const browser = await chromium.launch();
  const ctx = await browser.newContext();
  await ctx.addCookies([
    {
      name: "sid",
      value: token,
      domain: "localhost",
      path: "/",
      httpOnly: true,
      secure: false,
      sameSite: "Lax",
      expires: Math.floor(expires.getTime() / 1000),
    },
  ]);
  mkdirSync(resolve(here, ".auth"), { recursive: true });
  await ctx.storageState({ path: STATE });
  await browser.close();

  // eslint-disable-next-line no-console
  console.log(`[e2e] sessão criada para ${SEED_EMAIL} (${APP_URL})`);
}
