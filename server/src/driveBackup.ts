import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import { OAuth2Client } from "google-auth-library";
import { eq } from "drizzle-orm";
import { db } from "./db/client.js";
import { driveBackups } from "./db/schema.js";
import { env } from "./env.js";
import { REDIRECT_URI } from "./auth/google.js";

/**
 * Cópia do backup no Google Drive. An admin connects a Google account once
 * (Configurações > Backup); the nightly deploy/backup.sh then runs
 * scripts/driveSync.js, which sends the newest database dump and every file of
 * data/uploads not yet in the Drive (files never change: a new version is a new id).
 * Scope drive.file: the app only sees the files it created itself.
 */

export const DRIVE_SCOPES = ["openid", "email", "https://www.googleapis.com/auth/drive.file"];
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3/files";
const FOLDER = "application/vnd.google-apps.folder";
export const KEEP_DB_IN_DRIVE = 30;

export const driveClient = () => new OAuth2Client({ clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: REDIRECT_URI });

/** Page that turns the Drive API on, already in the project of our OAuth client
 *  (its number is the start of the client id: "123456-abc.apps.googleusercontent.com"). */
export function enableDriveApiUrl() {
  const project = env.GOOGLE_CLIENT_ID.split("-")[0];
  return /^\d+$/.test(project)
    ? `https://console.developers.google.com/apis/api/drive.googleapis.com/overview?project=${project}`
    : "https://console.cloud.google.com/apis/library/drive.googleapis.com";
}

export function driveAuthUrl(state: string, loginHint?: string) {
  return driveClient().generateAuthUrl({ access_type: "offline", prompt: "consent", scope: DRIVE_SCOPES, state, login_hint: loginHint });
}

// --- refresh token at rest ---------------------------------------------------------
const key = () => createHash("sha256").update(`${env.SESSION_SECRET}:drive-backup`).digest();
export function seal(plain: string) {
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), enc].map((b) => b.toString("base64")).join(".");
}
export function unseal(sealed: string) {
  const [iv, tag, enc] = sealed.split(".").map((p) => Buffer.from(p, "base64"));
  const d = createDecipheriv("aes-256-gcm", key(), iv);
  d.setAuthTag(tag);
  return Buffer.concat([d.update(enc), d.final()]).toString("utf8");
}

// --- tiny Drive REST client -----------------------------------------------------------
export class Drive {
  constructor(private token: string) {}

  static async forRefreshToken(refreshToken: string) {
    const c = driveClient();
    c.setCredentials({ refresh_token: refreshToken });
    const { token } = await c.getAccessToken();
    if (!token) throw new Error("o Google não devolveu acesso ao Drive (desconecte e conecte de novo)");
    return new Drive(token);
  }

  private async call<T>(url: string, init: RequestInit = {}): Promise<T> {
    const r = await fetch(url, { ...init, headers: { Authorization: `Bearer ${this.token}`, ...(init.headers ?? {}) } });
    if (!r.ok) {
      const body = await r.text();
      const reason = /accessNotConfigured|has not been used|is disabled/i.test(body)
        ? "a API do Google Drive não está ativada no projeto do Google Cloud"
        : `Drive respondeu ${r.status}: ${body.slice(0, 300)}`;
      throw new Error(reason);
    }
    return (r.status === 204 ? undefined : r.json()) as T;
  }

  /** Is this folder still there (not deleted / not in the trash)? */
  async alive(id: string | null | undefined) {
    if (!id) return false;
    try { return !(await this.call<{ trashed: boolean }>(`${API}/files/${id}?fields=trashed`)).trashed; } catch { return false; }
  }

  async folder(name: string, parent?: string) {
    const f = await this.call<{ id: string }>(`${API}/files?fields=id`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: FOLDER, ...(parent ? { parents: [parent] } : {}) }),
    });
    return f.id;
  }

  /** Names (and ids) of everything in a folder. */
  async list(folderId: string) {
    const out: { id: string; name: string; createdTime: string }[] = [];
    let page: string | undefined;
    do {
      const q = new URLSearchParams({ q: `'${folderId}' in parents and trashed = false`, fields: "nextPageToken, files(id, name, createdTime)", pageSize: "1000", ...(page ? { pageToken: page } : {}) });
      const r = await this.call<{ nextPageToken?: string; files: typeof out }>(`${API}/files?${q}`);
      out.push(...r.files);
      page = r.nextPageToken;
    } while (page);
    return out;
  }

  /** Resumable upload: works for any size we keep (attachments go up to 25 MB). */
  async upload(folderId: string, name: string, bytes: Buffer, mimeType = "application/octet-stream") {
    const start = await fetch(`${UPLOAD}?uploadType=resumable&fields=id`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": mimeType, "X-Upload-Content-Length": String(bytes.length) },
      body: JSON.stringify({ name, parents: [folderId] }),
    });
    const location = start.headers.get("location");
    if (!start.ok || !location) throw new Error(`Drive recusou o envio de ${name}: ${start.status} ${(await start.text()).slice(0, 200)}`);
    const put = await fetch(location, { method: "PUT", headers: { "Content-Type": mimeType }, body: new Uint8Array(bytes) });
    if (!put.ok) throw new Error(`falha ao enviar ${name}: ${put.status}`);
  }

  async remove(id: string) {
    await this.call(`${API}/files/${id}`, { method: "DELETE" });
  }
}

/** Make sure "Venaflow - backup" with "banco" and "arquivos" exists; returns the ids. */
export async function ensureFolders(drive: Drive, orgId: string) {
  const row = (await db.select().from(driveBackups).where(eq(driveBackups.orgId, orgId)).limit(1))[0];
  if (!row) throw new Error("Drive não conectado");
  let { folderId, dbFolderId, filesFolderId } = row;
  if (!(await drive.alive(folderId))) { folderId = await drive.folder("Venaflow - backup"); dbFolderId = null; filesFolderId = null; }
  if (!(await drive.alive(dbFolderId))) dbFolderId = await drive.folder("banco", folderId!);
  if (!(await drive.alive(filesFolderId))) filesFolderId = await drive.folder("arquivos", folderId!);
  await db.update(driveBackups).set({ folderId, dbFolderId, filesFolderId }).where(eq(driveBackups.orgId, orgId));
  return { folderId: folderId!, dbFolderId: dbFolderId!, filesFolderId: filesFolderId! };
}

async function* walk(dir: string): AsyncGenerator<string> {
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const p = join(dir, e.name);
    if (e.isDirectory()) yield* walk(p);
    else if (e.isFile()) yield p;
  }
}

/**
 * The nightly copy: newest dump (if not there yet), new files, and only the last
 * KEEP_DB_IN_DRIVE dumps kept. Files are named by their path ("card/attachment").
 */
export async function syncToDrive(orgId: string, opts: { dbDir: string; uploadsDir: string }) {
  const row = (await db.select().from(driveBackups).where(eq(driveBackups.orgId, orgId)).limit(1))[0];
  if (!row) return null;
  const drive = await Drive.forRefreshToken(unseal(row.refreshToken));
  const f = await ensureFolders(drive, orgId);

  const dumps = (await readdir(opts.dbDir)).filter((n) => n.endsWith(".sql.gz")).sort();
  const newest = dumps.at(-1);
  const inDrive = await drive.list(f.dbFolderId);
  let dbSent = 0;
  if (newest && !inDrive.some((x) => x.name === newest)) {
    await drive.upload(f.dbFolderId, newest, await readFile(join(opts.dbDir, newest)), "application/gzip");
    dbSent = 1;
  }
  const all = (await drive.list(f.dbFolderId)).sort((a, b) => a.name.localeCompare(b.name));
  for (const old of all.slice(0, Math.max(0, all.length - KEEP_DB_IN_DRIVE))) await drive.remove(old.id);

  const have = new Set((await drive.list(f.filesFolderId)).map((x) => x.name));
  let filesSent = 0, bytes = 0;
  for await (const path of walk(opts.uploadsDir)) {
    const name = relative(opts.uploadsDir, path).split(sep).join("/");
    if (have.has(name) || basename(path).startsWith(".")) continue;
    const st = await stat(path);
    await drive.upload(f.filesFolderId, name, await readFile(path));
    filesSent++; bytes += st.size;
  }
  return { email: row.email, dbSent, filesSent, bytes, filesInDrive: have.size + filesSent };
}
