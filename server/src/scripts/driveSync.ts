// Nightly copy to Google Drive, run by deploy/backup.sh after the local backup:
//   node server/dist/scripts/driveSync.js /var/backups/fluxos/db /opt/fluxos/data/uploads
// Writes drive-status.json next to status.json; exits 1 on failure (backup.sh then alerts).
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { db } from "../db/client.js";
import { driveTargets } from "../db/schema.js";
import { syncToDrive } from "../driveBackup.js";

const [dbDir, uploadsDir] = process.argv.slice(2);
const statusFile = join(process.env.BACKUP_DIR ?? "/var/backups/fluxos", "drive-status.json");
const save = (s: object) => writeFile(statusFile, JSON.stringify({ at: new Date().toISOString(), ...s }), { mode: 0o644 });

try {
  const orgs = await db.select({ orgId: driveTargets.orgId }).from(driveTargets);
  if (!orgs.length) { console.log("Drive não conectado: nada a enviar"); process.exit(0); }
  for (const { orgId } of orgs) {
    const r = await syncToDrive(orgId, { dbDir, uploadsDir });
    if (!r) continue;
    const msg = `Drive (${r.email}): banco ${r.dbSent ? "enviado" : "já estava lá"}, ${r.filesSent} arquivo(s) novo(s) (${Math.round(r.bytes / 1024)} KB), ${r.filesInDrive} no total`;
    console.log(msg);
    await save({ status: "ok", message: msg, dbSent: r.dbSent, filesSent: r.filesSent });
  }
  process.exit(0);
} catch (err) {
  const msg = `Cópia no Google Drive falhou: ${err instanceof Error ? err.message : err}`;
  console.error(msg);
  await save({ status: "failed", message: msg }).catch(() => undefined);
  process.exit(1);
}
