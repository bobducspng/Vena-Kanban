import { OAuth2Client } from "google-auth-library";
import { env } from "../env.js";

// Your own Google developer app. Redirect is built from PUBLIC_BASE_URL so it
// survives ngrok restarts only if you use ngrok's static domain — register that
// exact callback URL in the Google Cloud Console.
export const REDIRECT_URI = `${env.PUBLIC_BASE_URL}/auth/google/callback`;

export const oauth = new OAuth2Client({
  clientId: env.GOOGLE_CLIENT_ID,
  clientSecret: env.GOOGLE_CLIENT_SECRET,
  redirectUri: REDIRECT_URI,
});

export function getAuthUrl(state: string): string {
  return oauth.generateAuthUrl({
    access_type: "online",
    scope: ["openid", "email", "profile"],
    state,
    prompt: "select_account",
  });
}

export interface GoogleProfile {
  sub: string;
  email: string;
  emailVerified: boolean;
  name?: string;
  picture?: string;
}

/** Exchange the auth code and verify the returned id_token. */
export async function exchangeCode(code: string): Promise<GoogleProfile> {
  const { tokens } = await oauth.getToken(code);
  if (!tokens.id_token) throw new Error("Google não retornou id_token");
  const ticket = await oauth.verifyIdToken({ idToken: tokens.id_token, audience: env.GOOGLE_CLIENT_ID });
  const p = ticket.getPayload();
  if (!p?.sub || !p.email) throw new Error("Perfil do Google incompleto");
  return { sub: p.sub, email: p.email, emailVerified: p.email_verified === true, name: p.name, picture: p.picture };
}
