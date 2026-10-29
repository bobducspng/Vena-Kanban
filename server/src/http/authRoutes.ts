import { randomBytes } from "node:crypto";
import { Router } from "express";
import { serialize, parse } from "cookie";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, memberships, organizations } from "../db/schema.js";
import { getAuthUrl, exchangeCode } from "../auth/google.js";
import { createSession, setSessionCookie, clearSessionCookie, destroySession } from "../auth/session.js";
import { env, isProd, isEmailAllowed } from "../env.js";

export const authRoutes = Router();
const STATE = "oauth_state";

authRoutes.get("/auth/google", (_req, res) => {
  const state = randomBytes(16).toString("hex");
  res.setHeader("Set-Cookie", serialize(STATE, state, {
    httpOnly: true, secure: isProd, sameSite: "lax", path: "/", maxAge: 600,
  }));
  res.redirect(getAuthUrl(state));
});

authRoutes.get("/auth/google/callback", async (req, res) => {
  try {
    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");
    const cookieState = parse(req.headers.cookie ?? "")[STATE];
    if (!code || !state || state !== cookieState) {
      res.status(400).send("Estado de OAuth inválido");
      return;
    }

    const profile = await exchangeCode(code);

    // Gate: only verified e-mails on the allowlist may sign in. Without this,
    // anyone with the public URL would log in and be made an admin below.
    if (!profile.emailVerified || !isEmailAllowed(profile.email)) {
      res.redirect(`${env.APP_ORIGIN}/login?error=nao_autorizado`);
      return;
    }

    // Upsert the user by Google subject.
    let user = (await db.select().from(users).where(eq(users.googleSub, profile.sub)).limit(1))[0];
    if (!user) {
      const id = crypto.randomUUID();
      await db.insert(users).values({ id, googleSub: profile.sub, email: profile.email, name: profile.name, avatarUrl: profile.picture });
      user = (await db.select().from(users).where(eq(users.id, id)).limit(1))[0];
    }

    // Single internal org: ensure it exists and the user is a member.
    let org = (await db.select().from(organizations).limit(1))[0];
    if (!org) {
      const id = crypto.randomUUID();
      await db.insert(organizations).values({ id, name: "Minha Empresa" });
      org = (await db.select().from(organizations).where(eq(organizations.id, id)).limit(1))[0];
    }
    const member = (await db.select().from(memberships).where(eq(memberships.userId, user.id)).limit(1))[0];
    if (!member) {
      // The first person sets the org up (admin); everyone after starts as a member
      // with no pipes until an admin adds them (closed by default, M10).
      const anyone = (await db.select({ id: memberships.id }).from(memberships).where(eq(memberships.orgId, org.id)).limit(1))[0];
      await db.insert(memberships).values({ id: crypto.randomUUID(), orgId: org.id, userId: user.id, role: anyone ? "member" : "admin" });
    }

    const token = await createSession(user.id);
    setSessionCookie(res, token);
    res.redirect(env.APP_ORIGIN);
  } catch (err) {
    console.error("OAuth callback error:", err);
    res.status(500).send("Falha no login");
  }
});

authRoutes.post("/auth/logout", async (req, res) => {
  await destroySession(req.headers.cookie);
  clearSessionCookie(res);
  res.json({ ok: true });
});
