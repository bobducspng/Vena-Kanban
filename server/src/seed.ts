// Seed realistic fake data (no real people). Idempotent: does nothing if an org
// already exists. Run on the VM with `npm run db:seed`.
import { randomUUID } from "node:crypto";
import { db, pool } from "./db/client.js";
import { organizations, users, memberships, pipes, phases, fields, cards, cardFields, cardAssignees, cardEvents } from "./db/schema.js";

async function main() {
  const existing = (await db.select().from(organizations).limit(1))[0];
  if (existing) {
    console.log("Org já existe — seed ignorado.");
    await pool.end();
    return;
  }

  const orgId = randomUUID();
  await db.insert(organizations).values({ id: orgId, name: "Minha Empresa" });

  const u = [
    { id: randomUUID(), googleSub: "seed-ana", email: "ana@empresa.com", name: "Ana Souza" },
    { id: randomUUID(), googleSub: "seed-bruno", email: "bruno@empresa.com", name: "Bruno Lima" },
    { id: randomUUID(), googleSub: "seed-carla", email: "carla@empresa.com", name: "Carla Dias" },
  ];
  for (const user of u) {
    await db.insert(users).values(user);
    await db.insert(memberships).values({ id: randomUUID(), orgId, userId: user.id, role: user === u[0] ? "admin" : "member" });
  }

  const pipeId = randomUUID();
  await db.insert(pipes).values({ id: pipeId, orgId, name: "Solicitações de compra", description: "Pedidos de compra do início à aprovação.", createdBy: u[0].id });

  const ph = [
    { id: randomUUID(), name: "Novo pedido", color: "gray", position: 0, isStart: true, isEnd: false },
    { id: randomUUID(), name: "Em análise", color: "blue", position: 1, isStart: false, isEnd: false },
    { id: randomUUID(), name: "Aprovação", color: "amber", position: 2, isStart: false, isEnd: false },
    { id: randomUUID(), name: "Concluído", color: "green", position: 3, isStart: false, isEnd: true },
  ];
  for (const p of ph) await db.insert(phases).values({ ...p, pipeId });

  const f = [
    { id: randomUUID(), label: "Item solicitado", type: "short_text", required: true, position: 0 },
    { id: randomUUID(), label: "Valor estimado", type: "currency", required: true, position: 1 },
    { id: randomUUID(), label: "Justificativa", type: "long_text", required: false, position: 2 },
  ];
  for (const field of f) await db.insert(fields).values({ ...field, pipeId, phaseId: ph[0].id });

  // A field on a non-start phase, to exercise multi-phase forms (ver BUG-003).
  // Opcional de propósito: não bloqueia o avanço das fases.
  await db.insert(fields).values({
    id: randomUUID(), pipeId, phaseId: ph[1].id,
    label: "Parecer da análise", type: "long_text", required: false, position: 0,
  });

  const c1 = randomUUID();
  await db.insert(cards).values({ id: c1, pipeId, currentPhaseId: ph[0].id, title: "Notebooks para o time de vendas", createdBy: u[0].id });
  await db.insert(cardFields).values({ id: randomUUID(), cardId: c1, fieldId: f[0].id, value: "5 notebooks", filledAt: new Date() });
  await db.insert(cardFields).values({ id: randomUUID(), cardId: c1, fieldId: f[1].id, value: 25000, filledAt: new Date() });
  await db.insert(cardAssignees).values({ cardId: c1, userId: u[0].id }); // responsável: Ana (ver BUG-004)
  await db.insert(cardEvents).values({ id: randomUUID(), cardId: c1, type: "created", actorId: u[0].id });

  console.log("Seed concluído.");
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
