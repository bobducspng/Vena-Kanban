import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import { eq } from "drizzle-orm";
import { db } from "./db/client.js";
import { driveTargets } from "./db/schema.js";
import { env } from "./env.js";

/**
 * Cópia do backup no Google Drive, without a Google Cloud project: the admin publishes
 * the Apps Script below as a web app in their own Google account ("Executar como: eu",
 * "Quem pode acessar: qualquer pessoa"), and pastes its /exec address in Configurações >
 * Backup. Every request carries a secret only this org knows. The nightly backup.sh runs
 * scripts/driveSync.js, which sends the newest database dump and the files of
 * data/uploads that are not in the Drive yet (files never change: a new version is a new id).
 */

export const KEEP_DB_IN_DRIVE = 30;
const SCRIPT_URL = /^https:\/\/script\.google\.com\/macros\/s\/[\w-]+\/exec$/;
export const isScriptUrl = (u: string) => SCRIPT_URL.test(u);

// --- secret at rest -------------------------------------------------------------------
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
export const newSecret = () => randomBytes(24).toString("base64url");

/** The Apps Script the admin pastes into script.google.com (with this org's secret). */
export function scriptCode(secret: string) {
  return `// Venaflow: cópia do backup no seu Google Drive.
// Não altere nada. Publique em Implantar > Nova implantação > App da Web.
var CHAVE = '${secret}';
var PASTA = 'Venaflow - backup';

function doPost(e) {
  try {
    var req = JSON.parse(e.postData.contents);
    if (req.chave !== CHAVE) return resposta({ erro: 'chave inválida' });
    var raiz = pasta_(PASTA, DriveApp.getRootFolder());
    if (req.acao === 'teste') return resposta({ ok: true, email: Session.getEffectiveUser().getEmail(), pasta: raiz.getUrl() });
    var sub = pasta_(req.pasta, raiz);
    if (req.acao === 'listar') {
      var nomes = [], it = sub.getFiles();
      while (it.hasNext()) nomes.push(it.next().getName());
      return resposta({ ok: true, nomes: nomes });
    }
    if (req.acao === 'enviar') {
      if (!sub.getFilesByName(req.nome).hasNext()) {
        sub.createFile(Utilities.newBlob(Utilities.base64Decode(req.dados), req.tipo || 'application/octet-stream', req.nome));
      }
      return resposta({ ok: true });
    }
    if (req.acao === 'apagar') {
      var velhos = sub.getFilesByName(req.nome);
      while (velhos.hasNext()) velhos.next().setTrashed(true);
      return resposta({ ok: true });
    }
    return resposta({ erro: 'ação desconhecida' });
  } catch (err) {
    return resposta({ erro: String(err) });
  }
}

function doGet() {
  return resposta({ ok: true, venaflow: 'backup' });
}

function pasta_(nome, mae) {
  var it = mae.getFoldersByName(nome);
  return it.hasNext() ? it.next() : mae.createFolder(nome);
}

function resposta(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
`;
}

/** Talks to the published script. */
export class ScriptDrive {
  constructor(private url: string, private secret: string) {
    if (!isScriptUrl(url)) throw new Error("endereço do app da Web inválido");
  }

  private async call<T>(body: Record<string, unknown>): Promise<T> {
    // Apps Script answers a POST with a redirect to the result (fetch follows it).
    const r = await fetch(this.url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ chave: this.secret, ...body }) });
    const text = await r.text();
    let data: { erro?: string } & T;
    try { data = JSON.parse(text); } catch {
      throw new Error(/accounts\.google\.com|ServiceLogin|Sign in/i.test(text)
        ? "o app da Web pede login: na implantação, \"Quem pode acessar\" precisa ser \"Qualquer pessoa\""
        : `o Google respondeu algo inesperado (${r.status}); confira o endereço do app da Web`);
    }
    if (data.erro) throw new Error(data.erro === "chave inválida" ? "o código colado no Apps Script não é o atual (copie de novo)" : `Apps Script: ${data.erro}`);
    return data;
  }

  test() { return this.call<{ email: string; pasta: string }>({ acao: "teste" }); }
  async list(folder: "banco" | "arquivos") { return (await this.call<{ nomes: string[] }>({ acao: "listar", pasta: folder })).nomes; }
  async upload(folder: "banco" | "arquivos", name: string, bytes: Buffer, mime = "application/octet-stream") {
    await this.call({ acao: "enviar", pasta: folder, nome: name, tipo: mime, dados: bytes.toString("base64") });
  }
  async remove(folder: "banco" | "arquivos", name: string) { await this.call({ acao: "apagar", pasta: folder, nome: name }); }
}

export async function targetOf(orgId: string) {
  const row = (await db.select().from(driveTargets).where(eq(driveTargets.orgId, orgId)).limit(1))[0];
  return row?.url ? { row, drive: new ScriptDrive(row.url, unseal(row.secret)) } : null;
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
  const t = await targetOf(orgId);
  if (!t) return null;
  const { drive } = t;

  const dumps = (await readdir(opts.dbDir)).filter((n) => n.endsWith(".sql.gz")).sort();
  const newest = dumps.at(-1);
  let inDrive = await drive.list("banco");
  let dbSent = 0;
  if (newest && !inDrive.includes(newest)) {
    await drive.upload("banco", newest, await readFile(join(opts.dbDir, newest)), "application/gzip");
    inDrive = [...inDrive, newest];
    dbSent = 1;
  }
  const sorted = inDrive.filter((n) => n.endsWith(".sql.gz")).sort();
  for (const old of sorted.slice(0, Math.max(0, sorted.length - KEEP_DB_IN_DRIVE))) await drive.remove("banco", old);

  const have = new Set(await drive.list("arquivos"));
  let filesSent = 0, bytes = 0;
  for await (const path of walk(opts.uploadsDir)) {
    const name = relative(opts.uploadsDir, path).split(sep).join("/");
    if (have.has(name) || basename(path).startsWith(".")) continue;
    const data = await readFile(path);
    await drive.upload("arquivos", name, data);
    filesSent++; bytes += data.length;
  }
  return { email: t.row.email ?? "", dbSent, filesSent, bytes, filesInDrive: have.size + filesSent };
}
