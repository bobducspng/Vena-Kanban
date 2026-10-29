// Called by deploy/backup.sh when the backup fails: e-mails every org admin.
//   node server/dist/scripts/backupAlert.js "mensagem"
import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { memberships, users } from "../db/schema.js";
import { sendMail } from "../mailer.js";

const message = process.argv[2] ?? "O backup do Venaflow falhou.";
const admins = await db.select({ email: users.email }).from(memberships).innerJoin(users, eq(users.id, memberships.userId)).where(eq(memberships.role, "admin"));
for (const a of admins) {
  await sendMail({
    to: a.email,
    subject: "Venaflow: o backup da noite falhou",
    heading: "O backup do Venaflow falhou",
    paragraphs: [message, "Enquanto isso não for resolvido, os dados de hoje não estão protegidos. Peça para verificarem a VM."],
  });
}
console.log(`aviso enviado para ${admins.length} administrador(es)`);
process.exit(0);
