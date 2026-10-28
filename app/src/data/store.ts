// Real data layer: backs `api` with the tRPC client. Same function names and
// signatures as the previous fake store, so no screen changed. Server outputs
// are mapped to the app's domain types (src/data/types.ts).
import { trpc, API_URL } from "../lib/trpc";
import type { Pipe, Phase, FieldDef, Card, CardFieldValue, CardEvent, User, FieldType, PhaseColor, EditableFieldType, Role, Label, Comment, ChecklistItem, Attachment, TrashedCard, DataTable, DbRecord, ConnectionSettings, ConnectedItem, Backlink, AutomationRule, AutomationLog, AutomationTrigger, AutomationAction } from "./types";
import type { ConditionDef, Rule, FieldAction } from "../lib/conditions";

/** A phase's conditional, as stored (the evaluator's ConditionDef + a name). */
export type Condition = ConditionDef & { name: string; pipeId: string };
type ConditionBody = { name: string; groups: Rule[][]; onTrue: FieldAction[]; onFalse: FieldAction[] };

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

type SrvPipe = { id: string; name: string; description: string | null; createdAt: Date | string; icon?: string | null; color?: string | null; noun?: string | null; createButtonLabel?: string | null; titleFieldId?: string | null; subtitleFieldIds?: unknown; deletedAt?: Date | string | null };
type SrvPhase = { id: string; pipeId: string; name: string; color: string | null; position: number; isStart: boolean; isEnd: boolean; description: string | null; canCreateCard: boolean; allowedTo?: string[]; assigneeIds?: string[] };
type SrvField = { id: string; pipeId: string; phaseId: string; label: string; type: string; required: boolean; options: unknown; position: number; description: string | null; help: string | null; editableOtherPhases: boolean; isUnique: boolean; validationRegex: string | null; archivedAt: Date | string | null; settings?: unknown };
type SrvCard = { id: string; number: number; pipeId: string; currentPhaseId: string; title: string; dueDate: Date | string | null; done: boolean; version: number; createdAt: Date | string; values: { fieldId: string; value: unknown }[]; assigneeIds: string[]; labelIds: string[]; checklistDone: number; checklistTotal: number; commentCount: number; attachmentCount: number };
type SrvEvent = { id: string; cardId: string; type: string; fromPhaseId: string | null; toPhaseId: string | null; actorId: string | null; data?: unknown; createdAt: Date | string };
type SrvUser = { id: string; name: string | null; email: string; role?: Role | null };

const mapPipe = (p: SrvPipe): Pipe => ({
  id: p.id, name: p.name, description: p.description ?? undefined, createdAt: toISO(p.createdAt),
  icon: p.icon, color: p.color, noun: p.noun, createButtonLabel: p.createButtonLabel, titleFieldId: p.titleFieldId,
  subtitleFieldIds: Array.isArray(p.subtitleFieldIds) ? (p.subtitleFieldIds as string[]) : [], deletedAt: toISON(p.deletedAt),
});
const mapPhase = (p: SrvPhase): Phase => ({ id: p.id, pipeId: p.pipeId, name: p.name, color: p.color ?? "gray", position: p.position, isStart: p.isStart, isEnd: p.isEnd, description: p.description, canCreateCard: p.canCreateCard, allowedTo: p.allowedTo ?? [], assigneeIds: p.assigneeIds ?? [] });
const mapField = (f: SrvField): FieldDef => ({ id: f.id, pipeId: f.pipeId, phaseId: f.phaseId, label: f.label, type: f.type as FieldType, required: f.required, options: Array.isArray(f.options) ? (f.options as string[]) : undefined, position: f.position, description: f.description, help: f.help, editableOtherPhases: f.editableOtherPhases, isUnique: f.isUnique, validationRegex: f.validationRegex, archivedAt: toISON(f.archivedAt),
  settings: f.settings ? {
    ...(f.settings as ConnectionSettings),
    fieldMap: (f.settings as Partial<ConnectionSettings>).fieldMap ?? [],
    requireChild: (f.settings as Partial<ConnectionSettings>).requireChild ?? false,
    requireChildrenDone: (f.settings as Partial<ConnectionSettings>).requireChildrenDone ?? false,
  } : null });
const mapCard = (c: SrvCard): Card => ({
  id: c.id, number: c.number, pipeId: c.pipeId, currentPhaseId: c.currentPhaseId, title: c.title,
  values: c.values.map((v) => ({ fieldId: v.fieldId, value: v.value as CardFieldValue["value"] })),
  assigneeIds: c.assigneeIds, dueDate: toISON(c.dueDate), done: c.done, version: c.version, createdAt: toISO(c.createdAt),
  labelIds: c.labelIds, checklistDone: c.checklistDone, checklistTotal: c.checklistTotal, commentCount: c.commentCount, attachmentCount: c.attachmentCount,
});
const mapEvent = (e: SrvEvent): CardEvent => ({
  id: e.id, cardId: e.cardId, type: e.type as CardEvent["type"], fromPhaseId: e.fromPhaseId, toPhaseId: e.toPhaseId, actorId: e.actorId, createdAt: toISO(e.createdAt),
  automation: (e.data as { automation?: string } | null)?.automation,
});
const mapUser = (u: SrvUser): User => ({ id: u.id, name: u.name ?? u.email, email: u.email, avatarColor: "blue", role: u.role });

type FieldProps = { description?: string | null; help?: string | null; editableOtherPhases?: boolean; isUnique?: boolean; validationRegex?: string | null };

/** JSON over plain HTTP with the session cookie; server errors become Error(message). */
async function fileFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, { credentials: "include", ...init });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as { error?: string }).error ?? (res.status === 413 ? "Arquivo grande demais" : "Falha no envio"));
  return data as T;
}

type SrvTable = { id: string; name: string; description: string | null; icon: string | null; color: string | null; titleFieldId: string | null; summaryFieldIds: unknown; createdAt: Date | string };
const mapTable = (t: SrvTable): DataTable => ({
  id: t.id, name: t.name, description: t.description, icon: t.icon, color: t.color, titleFieldId: t.titleFieldId,
  summaryFieldIds: Array.isArray(t.summaryFieldIds) ? (t.summaryFieldIds as string[]) : [], createdAt: toISO(t.createdAt),
});
type SrvColumn = { id: string; tableId: string; label: string; type: string; options: unknown; position: number; required: boolean; description: string | null; help: string | null; isUnique: boolean; validationRegex: string | null; archivedAt: Date | string | null };
/** A database column, shaped as a FieldDef so the same <Field> renders it (phaseId = table id). */
const mapColumn = (c: SrvColumn): FieldDef => ({
  id: c.id, pipeId: "", phaseId: c.tableId, label: c.label, type: c.type as FieldType, required: c.required,
  options: Array.isArray(c.options) ? (c.options as string[]) : undefined, position: c.position, description: c.description,
  help: c.help, editableOtherPhases: true, isUnique: c.isUnique, validationRegex: c.validationRegex, archivedAt: toISON(c.archivedAt),
});
type SrvRecord = { id: string; tableId: string; title: string; createdAt: Date | string; values: { fieldId: string; value: unknown }[] };
const mapRecord = (r: SrvRecord): DbRecord => ({
  id: r.id, tableId: r.tableId, title: r.title, createdAt: toISO(r.createdAt),
  values: r.values.map((v) => ({ fieldId: v.fieldId, value: v.value as CardFieldValue["value"] })),
});
type ColumnProps = { required?: boolean; options?: string[] | null; description?: string | null; help?: string | null; isUnique?: boolean; validationRegex?: string | null };

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
    update: async (input: {
      pipeId: string; name?: string; description?: string | null; icon?: string | null; color?: PhaseColor | null;
      noun?: string | null; createButtonLabel?: string | null; titleFieldId?: string | null; subtitleFieldIds?: string[];
    }): Promise<Pipe> => mapPipe(await trpc.pipe.update.mutate(input)),
    remove: (pipeId: string) => trpc.pipe.remove.mutate({ pipeId }),
    listDeleted: async (): Promise<Pipe[]> => (await trpc.pipe.listDeleted.query()).map(mapPipe),
    restore: (pipeId: string) => trpc.pipe.restore.mutate({ pipeId }),
  },

  phase: {
    listByPipe: async (pipeId: string): Promise<Phase[]> =>
      (await trpc.phase.listByPipe.query({ pipeId })).map(mapPhase),
    create: async (input: { pipeId: string; name: string; color?: PhaseColor }): Promise<Phase> =>
      mapPhase(await trpc.phase.create.mutate(input)),
    update: async (input: { phaseId: string; name?: string; color?: PhaseColor; isEnd?: boolean; description?: string | null; canCreateCard?: boolean }): Promise<Phase> =>
      mapPhase(await trpc.phase.update.mutate(input)),
    setTransitions: (phaseId: string, toPhaseIds: string[]) => trpc.phase.setTransitions.mutate({ phaseId, toPhaseIds }),
    setAssignees: (phaseId: string, userIds: string[]) => trpc.phase.setAssignees.mutate({ phaseId, userIds }),
    setStart: (phaseId: string) => trpc.phase.setStart.mutate({ phaseId }),
    reorder: (pipeId: string, phaseIds: string[]) => trpc.phase.reorder.mutate({ pipeId, phaseIds }),
    remove: (phaseId: string) => trpc.phase.remove.mutate({ phaseId }),
  },

  field: {
    listByPipe: async (pipeId: string, includeArchived = false): Promise<FieldDef[]> =>
      (await trpc.field.listByPipe.query({ pipeId, includeArchived })).map(mapField),
    archive: (fieldId: string, archived: boolean) => trpc.field.archive.mutate({ fieldId, archived }),
    listByPhase: async (phaseId: string): Promise<FieldDef[]> =>
      (await trpc.field.listByPhase.query({ phaseId })).map(mapField),
    create: async (input: { phaseId: string; label: string; type: EditableFieldType; required: boolean; options?: string[]; settings?: ConnectionSettings } & FieldProps): Promise<FieldDef> =>
      mapField(await trpc.field.create.mutate(input)),
    // The type is immutable after creation.
    update: async (input: { fieldId: string; label?: string; required?: boolean; options?: string[] | null; settings?: Partial<Pick<ConnectionSettings, "canSearch" | "canCreate" | "multiple" | "fieldMap" | "requireChild" | "requireChildrenDone">> } & FieldProps): Promise<FieldDef> =>
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
    create: async (input: { pipeId: string; phaseId?: string; title: string; values: CardFieldValue[] }): Promise<Card> => {
      try {
        return mapCard(await trpc.card.create.mutate(input));
      } catch (err) {
        rethrow(err);
      }
    },
    updateField: async (input: { cardId: string; fieldId: string; value: CardFieldValue["value"] }): Promise<Card> =>
      mapCard(await trpc.card.updateField.mutate(input)),
    update: async (input: { cardId: string; title?: string; dueDate?: string | null }): Promise<Card> =>
      mapCard(await trpc.card.update.mutate(input)),
    setAssignees: async (cardId: string, userIds: string[]): Promise<Card> =>
      mapCard(await trpc.card.setAssignees.mutate({ cardId, userIds })),
    setLabels: async (cardId: string, labelIds: string[]): Promise<Card> =>
      mapCard(await trpc.card.setLabels.mutate({ cardId, labelIds })),
    remove: (cardId: string) => trpc.card.remove.mutate({ cardId }),
    parents: (cardId: string): Promise<Backlink[]> => trpc.card.parents.query({ cardId }),
    refillConnection: async (cardId: string, fieldId: string): Promise<Card> =>
      mapCard(await trpc.card.refillConnection.mutate({ cardId, fieldId })),
    restore: async (cardId: string): Promise<Card> => mapCard(await trpc.card.restore.mutate({ cardId })),
    duplicate: async (cardId: string): Promise<Card> => mapCard(await trpc.card.duplicate.mutate({ cardId })),
    listTrash: async (pipeId: string): Promise<TrashedCard[]> =>
      (await trpc.card.listTrash.query({ pipeId })).map((c) => ({ ...c, deletedAt: toISO(c.deletedAt) })),
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

  database: {
    list: async (): Promise<DataTable[]> => (await trpc.database.list.query()).map(mapTable),
    get: async (tableId: string): Promise<DataTable> => mapTable(await trpc.database.get.query({ tableId })),
    create: async (name: string): Promise<DataTable> => mapTable(await trpc.database.create.mutate({ name })),
    update: async (input: { tableId: string; name?: string; description?: string | null; icon?: string | null; color?: PhaseColor | null; titleFieldId?: string; summaryFieldIds?: string[] }): Promise<DataTable> =>
      mapTable(await trpc.database.update.mutate(input)),
    remove: (tableId: string) => trpc.database.remove.mutate({ tableId }),
    listDeleted: async (): Promise<DataTable[]> => (await trpc.database.listDeleted.query()).map(mapTable),
    restore: (tableId: string) => trpc.database.restore.mutate({ tableId }),
    columns: async (tableId: string, includeArchived = false): Promise<FieldDef[]> =>
      (await trpc.database.columns.query({ tableId, includeArchived })).map(mapColumn),
    createColumn: (input: { tableId: string; label: string; type: string } & ColumnProps) =>
      trpc.database.createColumn.mutate(input as Parameters<typeof trpc.database.createColumn.mutate>[0]),
    updateColumn: (input: { fieldId: string; label?: string } & ColumnProps) => trpc.database.updateColumn.mutate(input),
    reorderColumns: (tableId: string, fieldIds: string[]) => trpc.database.reorderColumns.mutate({ tableId, fieldIds }),
    archiveColumn: (fieldId: string, archived: boolean) => trpc.database.archiveColumn.mutate({ fieldId, archived }),
    removeColumn: (fieldId: string) => trpc.database.removeColumn.mutate({ fieldId }),
    records: async (tableId: string): Promise<DbRecord[]> => (await trpc.database.records.query({ tableId })).map(mapRecord),
    record: async (recordId: string): Promise<DbRecord | null> => {
      const r = await trpc.database.record.query({ recordId });
      return r ? mapRecord(r) : null;
    },
    createRecord: async (tableId: string, values: CardFieldValue[]): Promise<DbRecord> => {
      try {
        return mapRecord(await trpc.database.createRecord.mutate({ tableId, values }));
      } catch (err) {
        rethrow(err);
      }
    },
    updateRecordValue: async (input: { recordId: string; fieldId: string; value: CardFieldValue["value"] }): Promise<DbRecord> =>
      mapRecord(await trpc.database.updateRecordValue.mutate(input)),
    removeRecord: (recordId: string) => trpc.database.removeRecord.mutate({ recordId }),
    recordUsage: (recordId: string): Promise<Backlink[]> => trpc.database.recordUsage.query({ recordId }),
  },

  automation: {
    list: async (pipeId: string): Promise<AutomationRule[]> =>
      (await trpc.automation.list.query({ pipeId })).map((r) => ({
        id: r.id, pipeId: r.pipeId, name: r.name, active: r.active,
        trigger: r.trigger as AutomationTrigger, groups: r.groups as AutomationRule["groups"], actions: r.actions as AutomationAction[],
        lastRunAt: toISON(r.lastRunAt), lastStatus: r.lastStatus as AutomationRule["lastStatus"], lastError: r.lastError,
      })),
    create: (input: { pipeId: string; name: string; trigger: AutomationTrigger; groups: Rule[][]; actions: AutomationAction[] }) =>
      trpc.automation.create.mutate(input as Parameters<typeof trpc.automation.create.mutate>[0]),
    update: (input: { ruleId: string; name: string; trigger: AutomationTrigger; groups: Rule[][]; actions: AutomationAction[] }) =>
      trpc.automation.update.mutate(input as Parameters<typeof trpc.automation.update.mutate>[0]),
    setActive: (ruleId: string, active: boolean) => trpc.automation.setActive.mutate({ ruleId, active }),
    duplicate: (ruleId: string) => trpc.automation.duplicate.mutate({ ruleId }),
    remove: (ruleId: string) => trpc.automation.remove.mutate({ ruleId }),
    logs: async (ruleId: string): Promise<AutomationLog[]> =>
      (await trpc.automation.logs.query({ ruleId })).map((l) => ({ id: l.id, status: l.status as AutomationLog["status"], message: l.message, createdAt: toISO(l.createdAt), card: l.card })),
    test: (ruleId: string, cardNumber: number, execute = false) => trpc.automation.test.mutate({ ruleId, cardNumber, execute }),
  },

  connection: {
    search: (fieldId: string, q: string): Promise<ConnectedItem[]> => trpc.connection.search.query({ fieldId, q }),
    describe: (fieldId: string, ids: string[]): Promise<ConnectedItem[]> => trpc.connection.describe.query({ fieldId, ids }),
  },

  condition: {
    listByPipe: async (pipeId: string): Promise<Condition[]> =>
      (await trpc.condition.listByPipe.query({ pipeId })).map((c) => ({
        id: c.id, pipeId: c.pipeId, phaseId: c.phaseId, name: c.name, position: c.position,
        groups: c.groups as Rule[][], onTrue: c.onTrue as FieldAction[], onFalse: c.onFalse as FieldAction[],
      })),
    create: (input: { phaseId: string } & ConditionBody) => trpc.condition.create.mutate(input),
    update: (input: { conditionId: string } & ConditionBody) => trpc.condition.update.mutate(input),
    move: (conditionId: string, dir: -1 | 1) => trpc.condition.move.mutate({ conditionId, dir }),
    remove: (conditionId: string) => trpc.condition.remove.mutate({ conditionId }),
  },

  label: {
    listByPipe: async (pipeId: string): Promise<Label[]> =>
      (await trpc.label.listByPipe.query({ pipeId })).map((l) => ({ ...l, color: l.color ?? "gray" })),
    create: (input: { pipeId: string; name: string; color: PhaseColor }) => trpc.label.create.mutate(input),
    update: (input: { labelId: string; name?: string; color?: PhaseColor }) => trpc.label.update.mutate(input),
    remove: (labelId: string) => trpc.label.remove.mutate({ labelId }),
  },

  comment: {
    listByCard: async (cardId: string): Promise<Comment[]> =>
      (await trpc.comment.listByCard.query({ cardId })).map((c) => ({ ...c, createdAt: toISO(c.createdAt) })),
    create: (input: { cardId: string; body: string; mentions: string[] }) => trpc.comment.create.mutate(input),
    remove: (commentId: string) => trpc.comment.remove.mutate({ commentId }),
  },

  checklist: {
    listByCard: async (cardId: string): Promise<ChecklistItem[]> => trpc.checklist.listByCard.query({ cardId }),
    add: (cardId: string, text: string) => trpc.checklist.add.mutate({ cardId, text }),
    update: (input: { itemId: string; text?: string; done?: boolean }) => trpc.checklist.update.mutate(input),
    remove: (itemId: string) => trpc.checklist.remove.mutate({ itemId }),
  },

  // Attachments go over plain HTTP (binary body), not tRPC.
  file: {
    // fieldId = attachments of an "Anexo" field; without it, the card's own "Anexos".
    listByCard: async (cardId: string, fieldId?: string): Promise<Attachment[]> =>
      fileFetch(`/files/cards/${cardId}${fieldId ? `?fieldId=${fieldId}` : ""}`),
    upload: async (cardId: string, file: File, fieldId?: string): Promise<Attachment> =>
      fileFetch(`/files/cards/${cardId}?name=${encodeURIComponent(file.name)}${fieldId ? `&fieldId=${fieldId}` : ""}`, {
        method: "POST", body: file, headers: { "Content-Type": file.type || "application/octet-stream" },
      }),
    remove: async (id: string): Promise<{ ok: true }> => fileFetch(`/files/${id}`, { method: "DELETE" }),
    url: (id: string) => `${API_URL}/files/${id}`,
  },
};

export type Api = typeof api;
