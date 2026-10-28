// Real data layer: backs `api` with the tRPC client. Same function names and
// signatures as the previous fake store, so no screen changed. Server outputs
// are mapped to the app's domain types (src/data/types.ts).
import { trpc } from "../lib/trpc";
import type { Pipe, Phase, FieldDef, Card, CardFieldValue, CardEvent, User, FieldType, PhaseColor, EditableFieldType, Role } from "./types";

// --- error handling: turn the server's required-fields message back into the
// structured error the forms expect, so inline per-field errors still work. ---
const REQ_PREFIX = "Preencha os campos obrigatórios:";

export class RequiredFieldError extends Error {
  missing: string[];
  constructor(missing: string[]) {
    super(`${REQ_PREFIX} ${missing.join(", ")}`);
    this.name = "RequiredFieldError";
    this.missing = missing;
  }
}

function rethrow(err: unknown): never {
  const msg = err instanceof Error ? err.message : String(err);
  if (msg.startsWith(REQ_PREFIX)) {
    const missing = msg.slice(REQ_PREFIX.length).split(",").map((s) => s.trim()).filter(Boolean);
    throw new RequiredFieldError(missing);
  }
  throw err instanceof Error ? err : new Error(msg);
}

// --- mappers: server row -> app domain type ---
const toISO = (d: Date | string | null | undefined): string =>
  d == null ? "" : (d instanceof Date ? d.toISOString() : d);
const toISON = (d: Date | string | null | undefined): string | null =>
  d == null ? null : (d instanceof Date ? d.toISOString() : d);

type SrvPipe = { id: string; name: string; description: string | null; createdAt: Date | string };
type SrvPhase = { id: string; pipeId: string; name: string; color: string | null; position: number; isStart: boolean; isEnd: boolean };
type SrvField = { id: string; pipeId: string; phaseId: string; label: string; type: string; required: boolean; options: unknown; position: number; description: string | null; help: string | null; editableOtherPhases: boolean; isUnique: boolean; validationRegex: string | null };
type SrvCard = { id: string; number: number; pipeId: string; currentPhaseId: string; title: string; dueDate: Date | string | null; done: boolean; version: number; createdAt: Date | string; values: { fieldId: string; value: unknown }[]; assigneeIds: string[] };
type SrvEvent = { id: string; cardId: string; type: string; fromPhaseId: string | null; toPhaseId: string | null; actorId: string | null; createdAt: Date | string };
type SrvUser = { id: string; name: string | null; email: string; role?: Role | null };

const mapPipe = (p: SrvPipe): Pipe => ({ id: p.id, name: p.name, description: p.description ?? undefined, createdAt: toISO(p.createdAt) });
const mapPhase = (p: SrvPhase): Phase => ({ id: p.id, pipeId: p.pipeId, name: p.name, color: p.color ?? "gray", position: p.position, isStart: p.isStart, isEnd: p.isEnd });
const mapField = (f: SrvField): FieldDef => ({ id: f.id, pipeId: f.pipeId, phaseId: f.phaseId, label: f.label, type: f.type as FieldType, required: f.required, options: Array.isArray(f.options) ? (f.options as string[]) : undefined, position: f.position, description: f.description, help: f.help, editableOtherPhases: f.editableOtherPhases, isUnique: f.isUnique, validationRegex: f.validationRegex });
const mapCard = (c: SrvCard): Card => ({
  id: c.id, number: c.number, pipeId: c.pipeId, currentPhaseId: c.currentPhaseId, title: c.title,
  values: c.values.map((v) => ({ fieldId: v.fieldId, value: v.value as CardFieldValue["value"] })),
  assigneeIds: c.assigneeIds, dueDate: toISON(c.dueDate), done: c.done, version: c.version, createdAt: toISO(c.createdAt),
});
const mapEvent = (e: SrvEvent): CardEvent => ({ id: e.id, cardId: e.cardId, type: e.type as CardEvent["type"], fromPhaseId: e.fromPhaseId, toPhaseId: e.toPhaseId, actorId: e.actorId, createdAt: toISO(e.createdAt) });
const mapUser = (u: SrvUser): User => ({ id: u.id, name: u.name ?? u.email, email: u.email, avatarColor: "blue", role: u.role });

type FieldProps = { description?: string | null; help?: string | null; editableOtherPhases?: boolean; isUnique?: boolean; validationRegex?: string | null };

export const api = {
  user: {
    list: async (): Promise<User[]> => (await trpc.user.list.query()).map(mapUser),
    get: async (id: string): Promise<User | null> => {
      const u = await trpc.user.get.query({ id });
      return u ? mapUser(u) : null;
    },
    // The authenticated user. Throws tRPC UNAUTHORIZED when there is no session
    // (used by RequireAuth to gate protected routes).
    me: async (): Promise<User | null> => {
      const u = await trpc.user.me.query();
      return u ? mapUser(u) : null;
    },
  },

  pipe: {
    list: async (): Promise<Pipe[]> => (await trpc.pipe.list.query()).map(mapPipe),
    get: async (pipeId: string): Promise<Pipe | null> => {
      const p = await trpc.pipe.get.query({ pipeId });
      return p ? mapPipe(p) : null;
    },
    create: async (input: { name: string; description?: string }): Promise<Pipe> =>
      mapPipe(await trpc.pipe.create.mutate(input)),
  },

  phase: {
    listByPipe: async (pipeId: string): Promise<Phase[]> =>
      (await trpc.phase.listByPipe.query({ pipeId })).map(mapPhase),
    create: async (input: { pipeId: string; name: string; color?: PhaseColor }): Promise<Phase> =>
      mapPhase(await trpc.phase.create.mutate(input)),
    update: async (input: { phaseId: string; name?: string; color?: PhaseColor; isEnd?: boolean }): Promise<Phase> =>
      mapPhase(await trpc.phase.update.mutate(input)),
    setStart: (phaseId: string) => trpc.phase.setStart.mutate({ phaseId }),
    reorder: (pipeId: string, phaseIds: string[]) => trpc.phase.reorder.mutate({ pipeId, phaseIds }),
    remove: (phaseId: string) => trpc.phase.remove.mutate({ phaseId }),
  },

  field: {
    listByPipe: async (pipeId: string): Promise<FieldDef[]> =>
      (await trpc.field.listByPipe.query({ pipeId })).map(mapField),
    listByPhase: async (phaseId: string): Promise<FieldDef[]> =>
      (await trpc.field.listByPhase.query({ phaseId })).map(mapField),
    create: async (input: { phaseId: string; label: string; type: EditableFieldType; required: boolean; options?: string[] } & FieldProps): Promise<FieldDef> =>
      mapField(await trpc.field.create.mutate(input)),
    // The type is immutable after creation.
    update: async (input: { fieldId: string; label?: string; required?: boolean; options?: string[] | null } & FieldProps): Promise<FieldDef> =>
      mapField(await trpc.field.update.mutate(input)),
    reorder: (phaseId: string, fieldIds: string[]) => trpc.field.reorder.mutate({ phaseId, fieldIds }),
    remove: (fieldId: string) => trpc.field.remove.mutate({ fieldId }),
  },

  card: {
    listByPipe: async (pipeId: string): Promise<Card[]> =>
      (await trpc.card.listByPipe.query({ pipeId })).map(mapCard),
    get: async (cardId: string): Promise<Card | null> => {
      const c = await trpc.card.get.query({ cardId });
      return c ? mapCard(c) : null;
    },
    create: async (input: { pipeId: string; title: string; values: CardFieldValue[] }): Promise<Card> => {
      try {
        return mapCard(await trpc.card.create.mutate(input));
      } catch (err) {
        rethrow(err);
      }
    },
    updateField: async (input: { cardId: string; fieldId: string; value: CardFieldValue["value"] }): Promise<Card> =>
      mapCard(await trpc.card.updateField.mutate(input)),
    move: async (input: { cardId: string; toPhaseId: string; version?: number }): Promise<Card> => {
      try {
        return mapCard(await trpc.card.move.mutate(input));
      } catch (err) {
        rethrow(err);
      }
    },
  },

  event: {
    listByCard: async (cardId: string): Promise<CardEvent[]> =>
      (await trpc.event.listByCard.query({ cardId })).map(mapEvent),
  },
};

export type Api = typeof api;
