// Address routing of the caixa de entrada (no database, no IMAP): npx tsx test/inbox.check.ts
process.env.SMTP_USER = "comunicacao@vena.app.br";
const { simpleParser } = await import("mailparser");
const { addressesOf, tagOf, pipeAddress, cardAddress } = await import("../src/inbox.js");
let bad = 0;
const eq = (got: unknown, want: unknown, what: string) => { if (JSON.stringify(got) !== JSON.stringify(want)) { bad++; console.log("FALHOU", what, got, want); } };
const raw = (to: string, extra = "") => `From: Cliente <joao@cliente.com>\r\nTo: ${to}\r\n${extra}Subject: Pedido de cotação\r\nMessage-ID: <abc@cliente.com>\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nOlá, segue o pedido.\r\n`;
eq(pipeAddress("ab12cd34ef"), "comunicacao+p-ab12cd34ef@vena.app.br", "endereço do pipe");
eq(cardAddress("zz99"), "comunicacao+c-zz99@vena.app.br", "endereço do card");
eq(tagOf(addressesOf(await simpleParser(raw("Venaflow <comunicacao+p-ab12cd34ef@vena.app.br>")))), { kind: "p", token: "ab12cd34ef" }, "pipe no Para");
eq(tagOf(addressesOf(await simpleParser(raw("outra@x.com", "Cc: COMUNICACAO+C-ZZ99@vena.app.br\r\n")))), { kind: "c", token: "zz99" }, "card na Cópia (maiúsculas)");
eq(tagOf(addressesOf(await simpleParser(raw("comunicacao@vena.app.br", "Delivered-To: comunicacao+p-q1@vena.app.br\r\n")))), { kind: "p", token: "q1" }, "pelo Delivered-To (Cco)");
eq(tagOf(addressesOf(await simpleParser(raw("comunicacao@vena.app.br")))), null, "e-mail comum da caixa: ignorado");
eq(tagOf(addressesOf(await simpleParser(raw("outro+p-abc@vena.app.br")))), null, "outra conta com +: ignorado");
console.log(bad ? `${bad} FALHA(S)` : "TODOS OK");
process.exit(bad ? 1 : 0);
