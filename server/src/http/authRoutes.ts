import { randomBytes } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { serialize, parse } from "cookie";
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { users, memberships, organizations, driveBackups } from "../db/schema.js";
import { getAuthUrl, exchangeCode } from "../auth/google.js";
import { createSession, setSessionCookie, clearSessionCookie, destroySession, getUserIdFromRequest } from "../auth/session.js";
import { Drive, driveAuthUrl, driveClient, ensureFolders, seal } from "../driveBackup.js";
import { recordAudit } from "../audit.js";
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

/** Configurações > Backup > "Conectar Google Drive" (admins). Same callback as the login,
 *  told apart by the "drive." state. */
authRoutes.get("/auth/google/drive", async (req, res) => {
  const admin = await adminOf(req);
  if (!admin) return res.status(403).send("Apenas administradores");
  const state = `drive.${randomBytes(16).toString("hex")}`;
  res.setHeader("Set-Cookie", serialize(STATE, state, { httpOnly: true, secure: isProd, sameSite: "lax", path: "/", maxAge: 600 }));
  res.redirect(driveAuthUrl(state, admin.email));
});

async function adminOf(req: Request) {
  const userId = await getUserIdFromRequest(req.headers.cookie);
  if (!userId) return null;
  const m = (await db.select().from(memberships).where(eq(memberships.userId, userId)).limit(1))[0];
  const u = (await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1))[0];
  return m?.role === "admin" && u ? { userId, orgId: m.orgId, email: u.email } : null;
}

async function driveCallback(req: Request, res: Response, code: string) {
  const back = (q: string) => res.redirect(`${env.APP_ORIGIN}/settings?${q}`);
  try {
    const admin = await adminOf(req);
    if (!admin) return back("drive=erro&motivo=" + encodeURIComponent("Apenas administradores conectam o Drive."));
    const client = driveClient();
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) return back("drive=erro&motivo=" + encodeURIComponent("O Google não deu acesso permanente. Tente de novo."));
    const ticket = tokens.id_token ? await client.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID }) : null;
    const email = ticket?.getPayload()?.email ?? admin.email;
    const row = { email, refreshToken: seal(tokens.refresh_token), connectedBy: admin.userId };
    await db.insert(driveBackups).values({ orgId: admin.orgId, ...row }).onDuplicateKeyUpdate({ set: { ...row, folderId: null, dbFolderId: null, filesFolderId: null } });
    // Creating the folders now proves the Drive API answers (it may be off in the Cloud project).
    await ensureFolders(await Drive.forRefreshToken(tokens.refresh_token), admin.orgId);
    await recordAudit(admin.orgId, admin.userId, "org.connectDrive", { email });
    back("drive=ok");
  } catch (err) {
    console.error("drive connect failed:", err);
    back("drive=erro&motivo=" + encodeURIComponent(err instanceof Error ? err.message : "falha ao conectar"));
  }
}

authRoutes.get("/auth/google/callback", async (req, res) => {
  try {
    const code = String(req.query.code ?? "");
    const state = String(req.query.state ?? "");
    const cookieState = parse(req.headers.cookie ?? "")[STATE];
    if (!code || !state || state !== cookieState) {
      res.status(400).send("Estado de OAuth inválido");
      return;
    }
    if (state.startsWith("drive.")) return driveCallback(req, res, code);

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
