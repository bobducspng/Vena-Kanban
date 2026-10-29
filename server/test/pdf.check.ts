// Renders a sample PDF (no database) to check the layout: npx tsx test/pdf.check.ts out.pdf
import { writeFile } from "node:fs/promises";
import { buildPdf } from "../src/pdf.js";

const values: Record<string, string> = { "#": "42", "título": "Compra de notebooks — Filial São Paulo", "pipe": "Compras", "fase": "Aprovação", "fornecedor": "Ação & Cia Ltda 🚀", "valor": "R$ 12.345,67", "data de hoje": "29/10/2026" };
const ctx = {
  card: { number: 42, title: "Compra de notebooks — Filial São Paulo" },
  fill: (t: string) => t.replace(/\{([^}]*)\}/g, (_m, k: string) => values[k.trim().toLowerCase()] ?? ""),
  entries: () => [
    ...["Solicitante", "Centro de custo", "Justificativa"].map((label, i) => ({ phase: "Solicitação", label, value: i === 2 ? "Os equipamentos atuais têm mais de cinco anos e não rodam o sistema novo. ".repeat(4) : `Valor ${i}` })),
    ...Array.from({ length: 30 }, (_, i) => ({ phase: "Aprovação", label: `Campo número ${i + 1}`, value: `Conteúdo ${i + 1} com acentuação: ção, é, ü` })),
  ],
};
const body = "# Pedido de compra {#}\n**Fornecedor:** {Fornecedor}\nValor total: **{Valor}**\n\n---\n## Itens\n- Notebook 14\"\n- Mouse sem fio\n\nTexto livre do modelo,\ncom duas linhas.\n\n{Todos os campos}\n\nAssinatura: ____________________";
const out = process.argv[2] ?? "sample.pdf";
// Plain look, then with a letterhead (a generated PNG logo, header and footer with placeholders).
await writeFile(out, await buildPdf(ctx, { orgName: "Vena", logo: null, header: null, footer: null }, body));
const logo = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAMgAAAA8CAIAAACsOWLGAAAAy0lEQVR4nO3cMQ3AMBAEwWcUQObfmIRDwqtI0YwWwBdX/xwIzNcH8E+GRcKwSBgWCcMiYVgkDIuEYZEwLBKGRcKwSBgWCcMiYVgkDIvEPGtL1zMsJRmWkgxLSYalJMNSkmEpybCUZFhKMiwlGZaSDEtJhqUkw1KSYSnJsJRkWEoyLCUZlpIMS0mGpSTDUpJhKcmwlGRYSjIsJRmWkgxLSYalJN9mSBgWCcMiYVgkDIuEYZEwLBKGRcKwSBgWCcMiYVgkDIuEYZEwLBIv6L9RoHiFZnEAAAAASUVORK5CYII=", "base64");
await writeFile(out.replace(/\.pdf$/, "-timbrado.pdf"), await buildPdf(ctx, {
  orgName: "Vena", logo,
  header: "Vena Comércio Ltda · CNPJ 00.000.000/0001-00\nRua Exemplo, 100 · São Paulo/SP\nPedido {#} · {Data de hoje}",
  footer: "Documento interno da Vena · contato: comunicacao@vena.app.br\nCard {#}: {Título}",
}, body));
console.log("ok", out);
