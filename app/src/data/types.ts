// Domain types for the process app. These mirror replica/schema.sql so that the
// fake data layer and the future tRPC/MySQL backend share one shape.

export type Role = "admin" | "member" | "guest";

export type FieldType =
  | "short_text" | "long_text" | "email" | "phone" | "number" | "currency"
  | "date" | "datetime" | "time" | "due_date" | "select" | "radio" | "checklist" | "checkbox"
  | "assignee_select" | "label_select" | "attachment" | "document" | "id" | "connection" | "statement";

/** Field types the phase editor offers (server validates the same list). */
export const EDITABLE_FIELD_TYPES = [
  { value: "short_text", label: "Texto curto" },
  { value: "long_text", label: "Texto longo" },
  { value: "number", label: "Número" },
  { value: "currency", label: "Moeda (R$)" },
  { value: "date", label: "Data" },
  { value: "datetime", label: "Data e hora" },
  { value: "time", label: "Hora" },
  { value: "due_date", label: "Data de vencimento (alimenta o vencimento do card)" },
  { value: "email", label: "E-mail" },
  { value: "phone", label: "Telefone" },
  { value: "document", label: "CPF / CNPJ" },
  { value: "select", label: "Lista de opções" },
  { value: "radio", label: "Escolha única (botões)" },
  { value: "checklist", label: "Múltipla escolha (checklist)" },
  { value: "checkbox", label: "Sim / Não" },
  { value: "assignee_select", label: "Seleção de responsável" },
  { value: "label_select", label: "Etiqueta (vira as etiquetas do card)" },
  { value: "attachment", label: "Anexo" },
  { value: "id", label: "ID do card (somente leitura)" },
  { value: "connection", label: "Conexão (database ou outro pipe)" },
] as const;
export type EditableFieldType = (typeof EDITABLE_FIELD_TYPES)[number]["value"];

/** Column types a database offers (no phase-only types: due date, label, attachment, ID). */
export const DB_COLUMN_TYPES = EDITABLE_FIELD_TYPES.filter((t) =>
  !["due_date", "label_select", "attachment", "id", "connection"].includes(t.value));

/** "Conexão" field: what it points to and how items get connected. */
export interface ConnectionSettings {
  target: "table" | "pipe";
  targetId: string;
  canSearch: boolean;
  canCreate: boolean;
  multiple: boolean;
  /** Autopreenchimento: source column/field → field of this pipe (copied on connect). */
  fieldMap: { from: string; to: string }[];
  /** Pai/filho (pipe targets): rules checked when the parent concludes. */
  requireChild: boolean;
  requireChildrenDone: boolean;
}

/** A card that points at an item through a connection field (parent card / "usado em"). */
export interface Backlink {
  cardId: string;
  number: number;
  title: string;
  pipeId: string;
  pipeName: string;
  fieldLabel: string;
  done: boolean;
}

/** A connected record/card as shown on the card. */
export interface ConnectedItem {
  id: string;
  title: string;
  details: string[];
  number?: number;
}

/** A database ("tabela"): org-wide registry that cards connect to. */
export interface DataTable {
  id: string;
  name: string;
  description?: string | null;
  icon?: string | null;
  color?: string | null;
  titleFieldId?: string | null;
  summaryFieldIds: string[];
  createdAt: string;
}

/** A row of a database. `title` comes from the table's title column. */
export interface DbRecord {
  id: string;
  tableId: string;
  title: string;
  values: CardFieldValue[];
  createdAt: string;
}

export const PHASE_COLORS = ["gray", "red", "orange", "amber", "green", "teal", "blue", "purple", "pink"] as const;
export type PhaseColor = (typeof PHASE_COLORS)[number];

export interface User {
  id: string;
  name: string;
  email: string;
  avatarColor: string; // one of the label-* roles, for the avatar
  role?: Role | null; // org role; only set for the current user (user.me)
}

export interface FieldDef {
  id: string;
  pipeId: string;
  phaseId: string;
  label: string;
  type: FieldType;
  required: boolean;
  options?: string[]; // for select/radio/checkbox
  position: number;
  description?: string | null;
  help?: string | null;
  editableOtherPhases: boolean; // false = only editable while the card is in this phase
  isUnique: boolean;
  validationRegex?: string | null;
  archivedAt?: string | null;
  settings?: ConnectionSettings | null; // connection fields
}

/** Field types that accept "valor único" (server checks the same list). */
export const UNIQUE_FIELD_TYPES: FieldType[] = ["short_text", "email", "phone", "document", "number", "currency", "date", "datetime"];
/** Types with an options list. */
export const OPTION_FIELD_TYPES: FieldType[] = ["select", "radio", "checklist"];

export interface Phase {
  id: string;
  pipeId: string;
  name: string;
  color: string; // a label-* role name, e.g. "blue"
  position: number;
  isStart: boolean;
  isEnd: boolean;
  description?: string | null;
  canCreateCard: boolean; // new cards may also start here
  allowedTo: string[]; // "Mover para": phases a card here may be moved to
  assigneeIds: string[]; // responsáveis da fase
}

export interface Pipe {
  id: string;
  name: string;
  description?: string;
  createdAt: string;
  icon?: string | null; // emoji
  color?: string | null;
  noun?: string | null; // what a card is called here, e.g. "pedido"
  createButtonLabel?: string | null;
  titleFieldId?: string | null; // start-form field that names new cards
  subtitleFieldIds: string[]; // fields shown on the board tile
  deletedAt?: string | null;
}

export interface CardFieldValue {
  fieldId: string;
  // string[] = checklist options, user ids (responsáveis), label ids or attachment ids.
  value: string | number | boolean | null | string[];
}

export interface Card {
  id: string;
  number: number; // sequential, human-facing ID (#1042)
  pipeId: string;
  currentPhaseId: string;
  title: string;
  values: CardFieldValue[];
  assigneeIds: string[];
  dueDate?: string | null;
  done: boolean;
  version: number; // optimistic lock, sent back on move (BUG-005)
  createdAt: string;
  labelIds: string[];
  checklistDone: number;
  checklistTotal: number;
  commentCount: number;
  attachmentCount: number;
}

export interface Label {
  id: string;
  pipeId: string;
  name: string;
  color: string;
}

export interface Comment {
  id: string;
  cardId: string;
  authorId: string | null;
  body: string;
  createdAt: string;
}

export interface ChecklistItem {
  id: string;
  cardId: string;
  text: string;
  done: boolean;
  position: number;
}

export interface Attachment {
  id: string;
  cardId: string;
  filename: string;
  sizeBytes: number | null;
  mimeType: string | null;
  uploadedBy: string | null;
  createdAt: string;
}

export interface TrashedCard {
  id: string;
  number: number;
  title: string;
  deletedAt: string;
}

export interface CardEvent {
  id: string;
  cardId: string;
  type: string; // created, moved, field_updated, commented, assignees_changed, labels_changed, ...
  fromPhaseId?: string | null;
  toPhaseId?: string | null;
  actorId?: string | null;
  text?: string;
  automation?: string; // name of the automation that did it (no actor)
  createdAt: string;
}

/** Automation rule (M5): when (trigger) → if (conditions) → then (actions). */
export type AutomationTrigger = {
  type: "card_created" | "card_entered_phase" | "card_left_phase" | "field_updated" | "scheduled" | "children_in_phase";
  phaseId?: string;
  fieldId?: string;
  frequency?: "hourly" | "daily" | "weekly";
  time?: string; // "HH:MM", Brasília
  weekdays?: number[]; // 0 = domingo
};
export type AutomationAction =
  | { type: "move_card"; phaseId: string }
  | { type: "update_field"; fieldId: string; mode: "fixed" | "copy" | "date_offset" | "clear"; value?: string | number | boolean | null | string[]; fromFieldId?: string; days?: number }
  | { type: "assign"; mode: "round_robin" | "random" | "set"; userIds: string[] }
  | { type: "create_connected_card"; connectionFieldId: string; values: { toFieldId: string; fromFieldId?: string; value?: string | number | boolean | null | string[] }[] }
  | { type: "move_parent"; phaseId: string }
  | { type: "formula"; fieldId: string; expression: string }
  | { type: "http"; method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE"; url: string; headers: { name: string; value: string }[]; body?: string; saveToFieldId?: string };
export interface AutomationRule {
  id: string;
  pipeId: string;
  name: string;
  active: boolean;
  trigger: AutomationTrigger;
  groups: { fieldId: string; operator: string; value?: string | number | null }[][];
  actions: AutomationAction[];
  lastRunAt: string | null;
  lastStatus: "success" | "failed" | "skipped" | null;
  lastError: string | null;
}
export interface AutomationLog {
  id: string;
  status: "success" | "failed" | "skipped";
  message: string | null;
  createdAt: string;
  card: { id: string; number: number; title: string } | null;
}
