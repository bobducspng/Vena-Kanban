// Builds a signed PDF from a sample (no database): npx tsx test/signature.check.ts in.pdf out.pdf
import { readFile, writeFile } from "node:fs/promises";
import { buildSignedPdf, verificationCode } from "../src/signatures.js";

const [input, out = "signed.pdf"] = process.argv.slice(2);
const bytes = await readFile(input);
const now = new Date();
const signer = (name: string, email: string, doc: string | null) => ({
  id: crypto.randomUUID(), requestId: "r", name, email, token: "t", position: 0, viewedAt: now, signedAt: now, signedName: name,
  document: doc, ip: "189.6.12.34", userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0 Safari/537.36",
});
const r = { id: "3f2a9c1e-7b44-4d2a-9e10-55aa66bb77cc", title: "Ordem de compra #42", sha256: "a".repeat(64), completedAt: now };
await writeFile(out, await buildSignedPdf(bytes, r, [signer("Maria da Conceição Souza", "maria@cliente.com.br", "12345678901"), signer("João Pereira", "joao@vena.app.br", null)]));
if (verificationCode(r.id) !== "3F2A-9C1E-7B44-4D2A") throw new Error("code");
console.log("ok", out);
