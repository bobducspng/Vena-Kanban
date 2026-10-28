import { eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { db } from "../db/client.js";
import { cards, cardEvents } from "../db/schema.js";
import { assertPipeInOrg } from "./trpc.js";

/** Load a card and authorize its pipe. `allowDeleted` lets trash screens see it. */
export async function cardInOrg(cardId: string, orgId: string, allowDeleted = false) {
  const card = (await db.select().from(cards).where(eq(cards.id, cardId)).limit(1))[0];
  if (!card || (card.deletedAt && !allowDeleted)) throw new TRPCError({ code: "NOT_FOUND", message: "Card não encontrado" });
  await assertPipeInOrg(card.pipeId, orgId);
  return card;
}

/** Append to the card's activity log. */
export async function logEvent(cardId: string, type: string, actorId: string | null, data?: Record<string, unknown>) {
  await db.insert(cardEvents).values({ id: crypto.randomUUID(), cardId, type, actorId, data: data ?? null });
}
