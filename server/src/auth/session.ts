import { randomBytes } from "node:crypto";
import { eq } from "drizzle-orm";
import { serialize, parse } from "cookie";
import type { Response } from "express";
import { db } from "../db/client.js";
import { sessions } from "../db/schema.js";
import { env, isProd } from "../env.js";

const COOKIE = "sid";
const MAX_AGE_SEC = 60 * 60 * 24 * 30; // 30 days

export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + MAX_AGE_SEC * 1000);
  await db.insert(sessions).values({ id: token, userId, expiresAt });
  return token;
}

export async function getUserIdFromRequest(cookieHeader: string | undefined): Promise<string | null> {
  if (!cookieHeader) return null;
  const token = parse(cookieHeader)[COOKIE];
  if (!token) return null;
  const rows = await db.select().from(sessions).where(eq(sessions.id, token)).limit(1);
  const s = rows[0];
  if (!s) return null;
  if (s.expiresAt.getTime() < Date.now()) {
    await db.delete(sessions).where(eq(sessions.id, token));
    return null;
  }
  return s.userId;
}

export async function destroySession(cookieHeader: string | undefined): Promise<void> {
  if (!cookieHeader) return;
  const token = parse(cookieHeader)[COOKIE];
  if (token) await db.delete(sessions).where(eq(sessions.id, token));
}

export function setSessionCookie(res: Response, token: string): void {
  res.setHeader("Set-Cookie", serialize(COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax",
    path: "/",
    maxAge: MAX_AGE_SEC,
    domain: undefined,
  }));
  void env; // secret reserved for future signed cookies
}

export function clearSessionCookie(res: Response): void {
  res.setHeader("Set-Cookie", serialize(COOKIE, "", {
    httpOnly: true, secure: isProd, sameSite: "lax", path: "/", maxAge: 0,
  }));
}
