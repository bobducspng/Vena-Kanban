import { randomUUID } from "node:crypto";
import { sql } from "drizzle-orm";
import {
  mysqlTable, char, varchar, text, int, bigint, boolean, datetime, json,
  mysqlEnum, index, uniqueIndex, primaryKey,
} from "drizzle-orm/mysql-core";

// Shared column helpers ------------------------------------------------------
const id = () => char("id", { length: 36 }).primaryKey().$defaultFn(() => randomUUID());
const ref = (name: string) => char(name, { length: 36 });
const createdAt = () => datetime("created_at", { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`);
const updatedAt = () =>
  datetime("updated_at", { fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`).$onUpdate(() => new Date());

// Identity -------------------------------------------------------------------
export const organizations = mysqlTable("organizations", {
  id: id(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const users = mysqlTable("users", {
  id: id(),
  googleSub: varchar("google_sub", { length: 255 }).notNull(),
  email: varchar("email", { length: 320 }).notNull(),
  name: varchar("name", { length: 255 }),
  avatarUrl: varchar("avatar_url", { length: 1024 }),
  createdAt: createdAt(),
}, (t) => ({
  googleSubUq: uniqueIndex("uq_users_google_sub").on(t.googleSub),
  emailUq: uniqueIndex("uq_users_email").on(t.email),
}));

export const memberships = mysqlTable("memberships", {
  id: id(),
  orgId: ref("org_id").notNull(),
  userId: ref("user_id").notNull(),
  role: mysqlEnum("role", ["admin", "member", "guest"]).notNull().default("member"),
  createdAt: createdAt(),
}, (t) => ({
  uq: uniqueIndex("uq_membership").on(t.orgId, t.userId),
  userIdx: index("idx_membership_user").on(t.userId),
}));

// Sessions (server-side, referenced by an http-only cookie) ------------------
export const sessions = mysqlTable("sessions", {
  id: char("id", { length: 64 }).primaryKey(), // random token, not a UUID
  userId: ref("user_id").notNull(),
  expiresAt: datetime("expires_at", { fsp: 3 }).notNull(),
  createdAt: createdAt(),
}, (t) => ({ userIdx: index("idx_sessions_user").on(t.userId) }));

// Pipes / phases / fields ----------------------------------------------------
export const pipes = mysqlTable("pipes", {
  id: id(),
  orgId: ref("org_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  createdBy: ref("created_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({ orgIdx: index("idx_pipes_org").on(t.orgId) }));

export const phases = mysqlTable("phases", {
  id: id(),
  pipeId: ref("pipe_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  color: varchar("color", { length: 16 }),
  description: text("description"),
  position: int("position").notNull().default(0),
  isStart: boolean("is_start").notNull().default(false),
  isEnd: boolean("is_end").notNull().default(false),
  // Besides the start phase, new cards may also be created directly here.
  canCreateCard: boolean("can_create_card").notNull().default(false),
  createdAt: createdAt(),
}, (t) => ({ pipeIdx: index("idx_phases_pipe").on(t.pipeId, t.position) }));

// "Mover para": where a card in `fromPhaseId` may be moved manually. A new phase
// is linked to its neighbour, so by default cards walk one phase at a time.
export const phaseTransitions = mysqlTable("phase_transitions", {
  fromPhaseId: ref("from_phase_id").notNull(),
  toPhaseId: ref("to_phase_id").notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.fromPhaseId, t.toPhaseId] }),
  toIdx: index("idx_transitions_to").on(t.toPhaseId),
}));

export const fields = mysqlTable("fields", {
  id: id(),
  pipeId: ref("pipe_id").notNull(),
  phaseId: ref("phase_id").notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  type: varchar("type", { length: 32 }).notNull(),
  required: boolean("required").notNull().default(false),
  description: text("description"),
  help: varchar("help", { length: 500 }),
  // false = only editable while the card is in this field's phase.
  editableOtherPhases: boolean("editable_other_phases").notNull().default(true),
  // Rejects a value already used by another card of the pipe.
  isUnique: boolean("is_unique").notNull().default(false),
  validationRegex: varchar("validation_regex", { length: 500 }),
  options: json("options"),
  settings: json("settings"),
  position: int("position").notNull().default(0),
  createdAt: createdAt(),
}, (t) => ({
  pipeIdx: index("idx_fields_pipe").on(t.pipeId),
  phaseIdx: index("idx_fields_phase").on(t.phaseId, t.position),
}));

export const labels = mysqlTable("labels", {
  id: id(),
  pipeId: ref("pipe_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  color: varchar("color", { length: 16 }),
}, (t) => ({ pipeIdx: index("idx_labels_pipe").on(t.pipeId) }));

// Cards ----------------------------------------------------------------------
export const cards = mysqlTable("cards", {
  id: id(),
  // Human-facing sequential ID (#1042), unique across the whole app.
  number: int("number").autoincrement().notNull(),
  pipeId: ref("pipe_id").notNull(),
  currentPhaseId: ref("current_phase_id").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  createdBy: ref("created_by"),
  dueDate: datetime("due_date", { fsp: 3 }),
  done: boolean("done").notNull().default(false),
  late: boolean("late").notNull().default(false),
  version: int("version").notNull().default(0),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  numberUq: uniqueIndex("uq_cards_number").on(t.number),
  pipeIdx: index("idx_cards_pipe").on(t.pipeId),
  phaseIdx: index("idx_cards_phase").on(t.currentPhaseId),
  dueIdx: index("idx_cards_due").on(t.pipeId, t.dueDate),
}));

export const cardFields = mysqlTable("card_fields", {
  id: id(),
  cardId: ref("card_id").notNull(),
  fieldId: ref("field_id").notNull(),
  value: json("value"),
  filledAt: datetime("filled_at", { fsp: 3 }),
}, (t) => ({
  uq: uniqueIndex("uq_card_field").on(t.cardId, t.fieldId),
  fieldIdx: index("idx_card_fields_field").on(t.fieldId),
}));

export const cardAssignees = mysqlTable("card_assignees", {
  cardId: ref("card_id").notNull(),
  userId: ref("user_id").notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.cardId, t.userId] }),
  userIdx: index("idx_assignee_user").on(t.userId),
}));

export const cardLabels = mysqlTable("card_labels", {
  cardId: ref("card_id").notNull(),
  labelId: ref("label_id").notNull(),
}, (t) => ({
  pk: primaryKey({ columns: [t.cardId, t.labelId] }),
  labelIdx: index("idx_cardlabels_label").on(t.labelId),
}));

export const comments = mysqlTable("comments", {
  id: id(),
  cardId: ref("card_id").notNull(),
  authorId: ref("author_id"),
  body: text("body").notNull(),
  createdAt: createdAt(),
}, (t) => ({ cardIdx: index("idx_comments_card").on(t.cardId, t.createdAt) }));

export const attachments = mysqlTable("attachments", {
  id: id(),
  cardId: ref("card_id"),
  cardFieldId: ref("card_field_id"),
  filename: varchar("filename", { length: 512 }).notNull(),
  url: varchar("url", { length: 2048 }).notNull(),
  sizeBytes: bigint("size_bytes", { mode: "number" }),
  uploadedBy: ref("uploaded_by"),
  createdAt: createdAt(),
}, (t) => ({ cardIdx: index("idx_attach_card").on(t.cardId) }));

export const cardEvents = mysqlTable("card_events", {
  id: id(),
  cardId: ref("card_id").notNull(),
  type: varchar("type", { length: 48 }).notNull(),
  fromPhaseId: ref("from_phase_id"),
  toPhaseId: ref("to_phase_id"),
  actorId: ref("actor_id"),
  data: json("data"),
  createdAt: createdAt(),
}, (t) => ({ cardIdx: index("idx_events_card").on(t.cardId, t.createdAt) }));

// Databases (tables) ---------------------------------------------------------
export const dataTables = mysqlTable("data_tables", {
  id: id(),
  orgId: ref("org_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  createdAt: createdAt(),
}, (t) => ({ orgIdx: index("idx_tables_org").on(t.orgId) }));

export const tableFields = mysqlTable("table_fields", {
  id: id(),
  tableId: ref("table_id").notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  type: varchar("type", { length: 32 }).notNull(),
  options: json("options"),
  position: int("position").notNull().default(0),
}, (t) => ({ tableIdx: index("idx_tablefields_table").on(t.tableId, t.position) }));

export const tableRecords = mysqlTable("table_records", {
  id: id(),
  tableId: ref("table_id").notNull(),
  title: varchar("title", { length: 512 }).notNull(),
  createdBy: ref("created_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({ tableIdx: index("idx_records_table").on(t.tableId) }));

export const tableRecordFields = mysqlTable("table_record_fields", {
  id: id(),
  recordId: ref("record_id").notNull(),
  fieldId: ref("field_id").notNull(),
  value: json("value"),
}, (t) => ({ uq: uniqueIndex("uq_record_field").on(t.recordId, t.fieldId) }));

export const itemLinks = mysqlTable("item_links", {
  id: id(),
  fieldId: ref("field_id"),
  fromItemType: mysqlEnum("from_item_type", ["card", "record"]).notNull(),
  fromItemId: ref("from_item_id").notNull(),
  toItemType: mysqlEnum("to_item_type", ["card", "record"]).notNull(),
  toItemId: ref("to_item_id").notNull(),
  createdAt: createdAt(),
}, (t) => ({
  uq: uniqueIndex("uq_link").on(t.fieldId, t.fromItemId, t.toItemId),
  fromIdx: index("idx_link_from").on(t.fromItemType, t.fromItemId),
  toIdx: index("idx_link_to").on(t.toItemType, t.toItemId),
}));

// Automations ----------------------------------------------------------------
export const automations = mysqlTable("automations", {
  id: id(),
  pipeId: ref("pipe_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  eventType: mysqlEnum("event_type", ["card_enters_phase", "field_updated", "card_created", "schedule", "alert"]).notNull(),
  eventConfig: json("event_config"),
  condJson: json("cond_json"),
  actionType: mysqlEnum("action_type", ["move_card", "update_field", "create_connected_card", "create_record", "notify"]).notNull(),
  actionConfig: json("action_config"),
  active: boolean("active").notNull().default(true),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({
  pipeIdx: index("idx_autom_pipe").on(t.pipeId, t.active),
  eventIdx: index("idx_autom_event").on(t.pipeId, t.eventType),
}));

export const automationRuns = mysqlTable("automation_runs", {
  id: id(),
  automationId: ref("automation_id").notNull(),
  cardId: ref("card_id"),
  status: mysqlEnum("status", ["success", "skipped", "failed"]).notNull(),
  countedTask: boolean("counted_task").notNull().default(true),
  dedupeKey: varchar("dedupe_key", { length: 255 }),
  error: text("error"),
  createdAt: createdAt(),
}, (t) => ({
  dedupeUq: uniqueIndex("uq_run_dedupe").on(t.dedupeKey),
  automIdx: index("idx_runs_autom").on(t.automationId, t.createdAt),
}));

// Public forms + portals -----------------------------------------------------
export const publicForms = mysqlTable("public_forms", {
  id: id(),
  pipeId: ref("pipe_id").notNull(),
  phaseId: ref("phase_id"),
  slug: varchar("slug", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }),
  branding: json("branding"),
  isPublic: boolean("is_public").notNull().default(true),
  closed: boolean("closed").notNull().default(false),
  createdAt: createdAt(),
}, (t) => ({
  slugUq: uniqueIndex("uq_form_slug").on(t.slug),
  pipeIdx: index("idx_forms_pipe").on(t.pipeId),
}));

export const portals = mysqlTable("portals", {
  id: id(),
  orgId: ref("org_id").notNull(),
  slug: varchar("slug", { length: 64 }).notNull(),
  title: varchar("title", { length: 255 }),
  branding: json("branding"),
  createdAt: createdAt(),
}, (t) => ({ slugUq: uniqueIndex("uq_portal_slug").on(t.slug) }));

export const portalForms = mysqlTable("portal_forms", {
  portalId: ref("portal_id").notNull(),
  formId: ref("form_id").notNull(),
  position: int("position").notNull().default(0),
}, (t) => ({ pk: primaryKey({ columns: [t.portalId, t.formId] }) }));

// Reports + dashboards -------------------------------------------------------
export const reports = mysqlTable("reports", {
  id: id(),
  orgId: ref("org_id").notNull(),
  scope: mysqlEnum("scope", ["pipe", "company"]).notNull().default("pipe"),
  pipeId: ref("pipe_id"),
  name: varchar("name", { length: 255 }).notNull(),
  config: json("config"),
  createdBy: ref("created_by"),
  createdAt: createdAt(),
}, (t) => ({ orgIdx: index("idx_reports_org").on(t.orgId) }));

export const dashboards = mysqlTable("dashboards", {
  id: id(),
  orgId: ref("org_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  createdBy: ref("created_by"),
  createdAt: createdAt(),
}, (t) => ({ orgIdx: index("idx_dash_org").on(t.orgId) }));

export const dashboardWidgets = mysqlTable("dashboard_widgets", {
  id: id(),
  dashboardId: ref("dashboard_id").notNull(),
  type: mysqlEnum("type", ["line", "bar", "area", "table", "calendar", "number"]).notNull(),
  source: json("source"),
  config: json("config"),
  position: int("position").notNull().default(0),
}, (t) => ({ dashIdx: index("idx_widgets_dash").on(t.dashboardId, t.position) }));
