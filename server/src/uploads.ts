import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Attachments live on the VM's disk (decision 2026-10-28), outside the repo's code:
// <repo>/data/uploads/<cardId>/<attachmentId>. From server/{src,dist} that is ../../data.
// Its own module so pdf.ts and the file routes can both use it without importing each other.
export const UPLOAD_DIR = process.env.UPLOAD_DIR ?? resolve(dirname(fileURLToPath(import.meta.url)), "../../data/uploads");
