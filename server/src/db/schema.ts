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
  icon: varchar("icon", { length: 16 }), // an emoji
  color: varchar("color", { length: 16 }),
  noun: varchar("noun", { length: 64 }), // what a card is called here ("pedido", "candidato")
  createButtonLabel: varchar("create_button_label", { length: 64 }),
  // Start-form field whose value becomes the card title (new cards).
  titleFieldId: ref("title_field_id"),
  // Fields shown on the closed card in the board.
  subtitleFieldIds: json("subtitle_field_ids"),
  // Prazo do pipe: max time from creation to an end phase before the card is "expirado".
  expirationMinutes: int("expiration_minutes"),
  // Count SLAs/expiration in business time (org calendar) instead of calendar time.
  businessHoursOnly: boolean("business_hours_only").notNull().default(false),
  // Pasta na tela inicial (null = sem pasta).
  folder: varchar("folder", { length: 100 }),
  deletedAt: datetime("deleted_at", { fsp: 3 }),
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
  // SLA da fase: max time a card may stay here before it is "atrasado".
  slaMinutes: int("sla_minutes"),
  createdAt: createdAt(),
}, (t) => ({ pipeIdx: index("idx_phases_pipe").on(t.pipeId, t.position) }));

// Time spent in each phase (one row per stay; leftAt null = current phase).
export const cardPhaseHistory = mysqlTable("card_phase_history", {
  id: id(),
  cardId: ref("card_id").notNull(),
  phaseId: ref("phase_id").notNull(),
  enteredAt: datetime("entered_at", { fsp: 3 }).notNull(),
  leftAt: datetime("left_at", { fsp: 3 }),
  becameLate: boolean("became_late").notNull().default(false),
}, (t) => ({ cardIdx: index("idx_phasehist_card").on(t.cardId, t.enteredAt), phaseIdx: index("idx_phasehist_phase").on(t.phaseId) }));

// Cards opened from outside (formulário público): who asked, for confirmation and
// "Meus pedidos" (accessToken = their magic link).
export const requests = mysqlTable("requests", {
  id: id(),
  cardId: ref("card_id").notNull(),
  formId: ref("form_id"),
  email: varchar("email", { length: 320 }),
  accessToken: char("access_token", { length: 43 }).notNull(),
  createdAt: createdAt(),
}, (t) => ({ cardIdx: index("idx_requests_card").on(t.cardId), emailIdx: index("idx_requests_email").on(t.email), tokenUq: uniqueIndex("uq_requests_token").on(t.accessToken) }));

// Formulário de fase por link: someone outside fills the fields of one phase of a card.
export const phaseFormLinks = mysqlTable("phase_form_links", {
  id: id(),
  cardId: ref("card_id").notNull(),
  phaseId: ref("phase_id").notNull(),
  token: char("token", { length: 43 }).notNull(),
  sentTo: varchar("sent_to", { length: 320 }),
  createdBy: ref("created_by"),
  submittedAt: datetime("submitted_at", { fsp: 3 }),
  revokedAt: datetime("revoked_at", { fsp: 3 }),
  createdAt: createdAt(),
}, (t) => ({ cardIdx: index("idx_phaselinks_card").on(t.cardId), tokenUq: uniqueIndex("uq_phaselinks_token").on(t.token) }));

// "Meus pedidos": messages between the requester (outside) and the team, per request.
export const requestMessages = mysqlTable("request_messages", {
  id: id(),
  requestId: ref("request_id").notNull(),
  fromRequester: boolean("from_requester").notNull(),
  authorId: ref("author_id"), // team member (null when from the requester)
  body: text("body").notNull(),
  createdAt: createdAt(),
}, (t) => ({ reqIdx: index("idx_reqmsg_request").on(t.requestId, t.createdAt) }));

// E-mail templates of a pipe ({Campo} placeholders, see templates.ts).
export const emailTemplates = mysqlTable("email_templates", {
  id: id(),
  pipeId: ref("pipe_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  toSpec: varchar("to_spec", { length: 1000 }).notNull().default(""), // "a@b.com, {E-mail}, {Solicitante}"
  ccSpec: varchar("cc_spec", { length: 1000 }).notNull().default(""),
  subject: varchar("subject", { length: 500 }).notNull(),
  body: text("body").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({ pipeIdx: index("idx_emailtpl_pipe").on(t.pipeId) }));

// Modelos de PDF of a pipe (M11): text with {placeholders} and light markup (see pdf.ts).
export const pdfTemplates = mysqlTable("pdf_templates", {
  id: id(),
  pipeId: ref("pipe_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  body: text("body").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({ pipeIdx: index("idx_pdftpl_pipe").on(t.pipeId) }));

// E-mails sent from a card (manually or by an automation).
export const cardEmails = mysqlTable("card_emails", {
  id: id(),
  cardId: ref("card_id").notNull(),
  templateId: ref("template_id"),
  toList: varchar("to_list", { length: 2000 }).notNull(),
  ccList: varchar("cc_list", { length: 2000 }),
  subject: varchar("subject", { length: 500 }).notNull(),
  body: text("body").notNull(),
  attachmentIds: json("attachment_ids"),
  sentBy: ref("sent_by"), // null = automation
  via: varchar("via", { length: 255 }), // automation name
  status: varchar("status", { length: 16 }).notNull(), // sent | failed
  error: text("error"),
  createdAt: createdAt(),
}, (t) => ({ cardIdx: index("idx_cardemails_card").on(t.cardId, t.createdAt) }));

// Read-only data feed for Power BI (Web connector): one secret token per org.
export const biFeeds = mysqlTable("bi_feeds", {
  orgId: ref("org_id").primaryKey(),
  token: char("token", { length: 43 }).notNull(),
  createdBy: ref("created_by"),
  createdAt: createdAt(),
}, (t) => ({ tokenUq: uniqueIndex("uq_bifeeds_token").on(t.token) }));

// In-app notifications (sino): mentions, assignments, alerts, automation failures.
export const notifications = mysqlTable("notifications", {
  id: id(),
  userId: ref("user_id").notNull(),
  type: varchar("type", { length: 32 }).notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body"),
  cardId: ref("card_id"),
  pipeId: ref("pipe_id"),
  link: varchar("link", { length: 255 }), // app path to open (e.g. /pipes/:id/automations)
  readAt: datetime("read_at", { fsp: 3 }),
  createdAt: createdAt(),
}, (t) => ({ userIdx: index("idx_notif_user").on(t.userId, t.createdAt) }));

// Organisation's business calendar (expediente + feriados) for SLAs.
export const businessCalendars = mysqlTable("business_calendars", {
  orgId: ref("org_id").primaryKey(),
  weekdays: json("weekdays").notNull(), // [1..5] = seg–sex
  startTime: varchar("start_time", { length: 5 }).notNull(), // "08:00"
  endTime: varchar("end_time", { length: 5 }).notNull(), // "18:00"
  holidays: json("holidays").notNull(), // [{ date: "YYYY-MM-DD", name }]
  updatedAt: updatedAt(),
});

// Condicionais de campo of a phase's form (see src/conditions.ts for the semantics).
export const fieldConditions = mysqlTable("field_conditions", {
  id: id(),
  pipeId: ref("pipe_id").notNull(),
  phaseId: ref("phase_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  position: int("position").notNull().default(0),
  groups: json("groups").notNull(), // Rule[][]: groups OR'ed, rules AND'ed
  onTrue: json("on_true").notNull(), // FieldAction[]
  onFalse: json("on_false").notNull(), // FieldAction[]
  createdAt: createdAt(),
}, (t) => ({ phaseIdx: index("idx_conditions_phase").on(t.phaseId, t.position), pipeIdx: index("idx_conditions_pipe").on(t.pipeId) }));

// Auditoria: every configuration change made by an admin (who, what, when, with which data).
export const auditLog = mysqlTable("audit_log", {
  id: id(),
  orgId: ref("org_id").notNull(),
  userId: ref("user_id"),
  action: varchar("action", { length: 128 }).notNull(), // tRPC path, e.g. "field.update"
  input: text("input"), // JSON of the request, truncated
  createdAt: createdAt(),
}, (t) => ({ orgIdx: index("idx_audit_org").on(t.orgId, t.createdAt) }));

// Who may open a pipe (closed by default; org admins see every pipe).
// role: member (all cards) · my_cards (only cards they created or are responsável) · read (view + comment)
export const pipeMembers = mysqlTable("pipe_members", {
  pipeId: ref("pipe_id").notNull(),
  userId: ref("user_id").notNull(),
  role: varchar("role", { length: 16 }).notNull().default("member"),
  createdAt: createdAt(),
}, (t) => ({ pk: primaryKey({ columns: [t.pipeId, t.userId] }), userIdx: index("idx_pipemembers_user").on(t.userId) }));

// Responsáveis da fase: added to a card while it sits in the phase.
export const phaseAssignees = mysqlTable("phase_assignees", {
  phaseId: ref("phase_id").notNull(),
  userId: ref("user_id").notNull(),
}, (t) => ({ pk: primaryKey({ columns: [t.phaseId, t.userId] }) }));

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
  // Arquivado: leaves forms and cards, keeps its values; restorable.
  archivedAt: datetime("archived_at", { fsp: 3 }),
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
  // Alerts: when the card entered its current phase, and when it became
  // atrasado (phase SLA), expirado (pipe deadline) and vencido (due date).
  phaseEnteredAt: datetime("phase_entered_at", { fsp: 3 }),
  lateAt: datetime("late_at", { fsp: 3 }),
  expiredAt: datetime("expired_at", { fsp: 3 }),
  overdueAt: datetime("overdue_at", { fsp: 3 }),
  // Lixeira: soft delete. Deleted cards leave the board but can be restored.
  deletedAt: datetime("deleted_at", { fsp: 3 }),
  deletedBy: ref("deleted_by"),
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

// Checklist of a card (to-do items), independent of phase fields.
export const checklistItems = mysqlTable("checklist_items", {
  id: id(),
  cardId: ref("card_id").notNull(),
  text: varchar("text", { length: 500 }).notNull(),
  done: boolean("done").notNull().default(false),
  position: int("position").notNull().default(0),
  createdAt: createdAt(),
}, (t) => ({ cardIdx: index("idx_checklist_card").on(t.cardId, t.position) }));

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
  mimeType: varchar("mime_type", { length: 255 }),
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
  description: text("description"),
  icon: varchar("icon", { length: 16 }),
  color: varchar("color", { length: 16 }),
  // Column whose value names each record (shown in lists and connections).
  titleFieldId: ref("title_field_id"),
  // Columns shown next to the title when a record appears in a connection.
  summaryFieldIds: json("summary_field_ids"),
  deletedAt: datetime("deleted_at", { fsp: 3 }),
  createdAt: createdAt(),
}, (t) => ({ orgIdx: index("idx_tables_org").on(t.orgId) }));

export const tableFields = mysqlTable("table_fields", {
  id: id(),
  tableId: ref("table_id").notNull(),
  label: varchar("label", { length: 255 }).notNull(),
  type: varchar("type", { length: 32 }).notNull(),
  options: json("options"),
  position: int("position").notNull().default(0),
  // Same options as phase fields.
  required: boolean("required").notNull().default(false),
  description: text("description"),
  help: varchar("help", { length: 500 }),
  isUnique: boolean("is_unique").notNull().default(false),
  validationRegex: varchar("validation_regex", { length: 500 }),
  archivedAt: datetime("archived_at", { fsp: 3 }),
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

// Automations v2 (M5). The two tables above came from the first sketch (fixed enums,
// one action per rule) and were never used; these replace them.
export const automationRules = mysqlTable("automation_rules", {
  id: id(),
  pipeId: ref("pipe_id").notNull(),
  name: varchar("name", { length: 255 }).notNull(),
  active: boolean("active").notNull().default(true),
  trigger: json("trigger").notNull(), // { type, phaseId?, fieldId? }
  groups: json("groups").notNull(), // conditions: Rule[][] (same evaluator as conditionals)
  actions: json("actions").notNull(), // Action[] run in order
  state: json("state"), // e.g. round-robin cursor
  lastRunAt: datetime("last_run_at", { fsp: 3 }),
  lastStatus: varchar("last_status", { length: 16 }), // success | failed | skipped
  lastError: text("last_error"),
  createdBy: ref("created_by"),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
}, (t) => ({ pipeIdx: index("idx_rules_pipe").on(t.pipeId, t.active) }));

// One row per rule evaluation: what happened and why (kept 90 days).
export const automationLogs = mysqlTable("automation_logs", {
  id: id(),
  ruleId: ref("rule_id").notNull(),
  cardId: ref("card_id"),
  status: varchar("status", { length: 16 }).notNull(), // success | failed | skipped
  message: text("message"),
  durationMs: int("duration_ms"),
  createdAt: createdAt(),
}, (t) => ({ ruleIdx: index("idx_autolog_rule").on(t.ruleId, t.createdAt), cardIdx: index("idx_autolog_card").on(t.cardId) }));

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
