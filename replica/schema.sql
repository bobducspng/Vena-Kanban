-- Replica Pipefy — schema (MySQL 8.0, InnoDB, utf8mb4)
-- Target: MySQL on the Oracle Cloud VM (Ubuntu 24.04). Store all times in UTC.
-- IDs: CHAR(36) UUID, DEFAULT (UUID()) so raw SQL works; the app may also pass
-- crypto.randomUUID(). Money: integer cents + currency. No RLS in MySQL —
-- every query is scoped by org_id/user in the tRPC data layer (see architecture.md).
--
-- Reserved-word notes: table named data_tables (not `tables`); automation
-- columns are event_type/cond_json/action_type (not bare `event`/`condition`).

SET NAMES utf8mb4;
SET time_zone = '+00:00';

-- ---------------------------------------------------------------------------
-- Org + identity
-- ---------------------------------------------------------------------------

-- Single internal org for now; kept as a table so it can become multi-tenant later.
CREATE TABLE IF NOT EXISTS organizations (
  id         CHAR(36)    NOT NULL DEFAULT (UUID()),
  name       VARCHAR(255) NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Your existing Google-OAuth users table. If you already have one, DON'T recreate
-- it — just make sure it exposes an id (CHAR(36) or your type), email and
-- google_sub, and adapt the foreign keys below to its real name/type.
CREATE TABLE IF NOT EXISTS users (
  id         CHAR(36)     NOT NULL DEFAULT (UUID()),
  google_sub VARCHAR(255) NOT NULL,                 -- Google OAuth subject (stable id)
  email      VARCHAR(320) NOT NULL,
  name       VARCHAR(255) NULL,
  avatar_url VARCHAR(1024) NULL,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_users_google_sub (google_sub),
  UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Role of a user inside the org. MySQL ENUM is idiomatic for small closed sets.
CREATE TABLE IF NOT EXISTS memberships (
  id      CHAR(36) NOT NULL DEFAULT (UUID()),
  org_id  CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  role    ENUM('admin','member','guest') NOT NULL DEFAULT 'member',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_membership (org_id, user_id),
  KEY idx_membership_user (user_id),
  CONSTRAINT fk_membership_org  FOREIGN KEY (org_id)  REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_membership_user FOREIGN KEY (user_id) REFERENCES users(id)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Pipes, phases, fields  (S03, S11)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS pipes (
  id          CHAR(36)     NOT NULL DEFAULT (UUID()),
  org_id      CHAR(36)     NOT NULL,
  name        VARCHAR(255) NOT NULL,
  description TEXT         NULL,
  created_by  CHAR(36)     NULL,
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_pipes_org (org_id),
  CONSTRAINT fk_pipes_org     FOREIGN KEY (org_id)     REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_pipes_creator FOREIGN KEY (created_by) REFERENCES users(id)         ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Phases are the kanban columns; the start form is the fields of the is_start phase.
CREATE TABLE IF NOT EXISTS phases (
  id          CHAR(36)     NOT NULL DEFAULT (UUID()),
  pipe_id     CHAR(36)     NOT NULL,
  name        VARCHAR(255) NOT NULL,
  color       VARCHAR(16)  NULL,
  description TEXT         NULL,
  position    INT          NOT NULL DEFAULT 0,       -- order of columns
  is_start    TINYINT(1)   NOT NULL DEFAULT 0,       -- holds the start form
  is_end      TINYINT(1)   NOT NULL DEFAULT 0,       -- completes the card
  created_at  DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_phases_pipe (pipe_id, position),
  CONSTRAINT fk_phases_pipe FOREIGN KEY (pipe_id) REFERENCES pipes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Field DEFINITIONS (not values). type is a VARCHAR so new types don't need ALTER.
-- Allowed type values (from Pipefy recon): short_text, long_text, email, phone,
-- number, currency, date, datetime, due_date, time, select, radio, checkbox,
-- label_select, assignee_select, attachment, id, statement, connector,
-- dynamic_content, cpf, cnpj.
CREATE TABLE IF NOT EXISTS fields (
  id        CHAR(36)     NOT NULL DEFAULT (UUID()),
  pipe_id   CHAR(36)     NOT NULL,
  phase_id  CHAR(36)     NOT NULL,                   -- field lives on a phase (start form = is_start phase)
  label     VARCHAR(255) NOT NULL,
  type      VARCHAR(32)  NOT NULL,
  required  TINYINT(1)   NOT NULL DEFAULT 0,
  options   JSON         NULL,                       -- choices for select/radio/checkbox
  settings  JSON         NULL,                       -- connector target, conditional logic, masks, etc.
  position  INT          NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_fields_pipe (pipe_id),
  KEY idx_fields_phase (phase_id, position),
  CONSTRAINT fk_fields_pipe  FOREIGN KEY (pipe_id)  REFERENCES pipes(id)  ON DELETE CASCADE,
  CONSTRAINT fk_fields_phase FOREIGN KEY (phase_id) REFERENCES phases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS labels (
  id      CHAR(36)     NOT NULL DEFAULT (UUID()),
  pipe_id CHAR(36)     NOT NULL,
  name    VARCHAR(255) NOT NULL,
  color   VARCHAR(16)  NULL,
  PRIMARY KEY (id),
  KEY idx_labels_pipe (pipe_id),
  CONSTRAINT fk_labels_pipe FOREIGN KEY (pipe_id) REFERENCES pipes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Cards + values  (S06)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cards (
  id               CHAR(36)     NOT NULL DEFAULT (UUID()),
  pipe_id          CHAR(36)     NOT NULL,
  current_phase_id CHAR(36)     NOT NULL,
  title            VARCHAR(512) NOT NULL,
  created_by       CHAR(36)     NULL,
  due_date         DATETIME(3)  NULL,
  done             TINYINT(1)   NOT NULL DEFAULT 0,
  late             TINYINT(1)   NOT NULL DEFAULT 0,
  version          INT          NOT NULL DEFAULT 0,  -- optimistic lock for concurrent moves
  created_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_cards_pipe (pipe_id),
  KEY idx_cards_phase (current_phase_id),
  KEY idx_cards_due (pipe_id, due_date),
  CONSTRAINT fk_cards_pipe  FOREIGN KEY (pipe_id)          REFERENCES pipes(id)  ON DELETE CASCADE,
  CONSTRAINT fk_cards_phase FOREIGN KEY (current_phase_id) REFERENCES phases(id) ON DELETE RESTRICT,
  CONSTRAINT fk_cards_user  FOREIGN KEY (created_by)       REFERENCES users(id)  ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- One value per (card, field). value is JSON so any field type fits one column.
CREATE TABLE IF NOT EXISTS card_fields (
  id        CHAR(36)    NOT NULL DEFAULT (UUID()),
  card_id   CHAR(36)    NOT NULL,
  field_id  CHAR(36)    NOT NULL,
  value     JSON        NULL,
  filled_at DATETIME(3) NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_card_field (card_id, field_id),
  KEY idx_card_fields_field (field_id),
  CONSTRAINT fk_cardfields_card  FOREIGN KEY (card_id)  REFERENCES cards(id)  ON DELETE CASCADE,
  CONSTRAINT fk_cardfields_field FOREIGN KEY (field_id) REFERENCES fields(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS card_assignees (
  card_id CHAR(36) NOT NULL,
  user_id CHAR(36) NOT NULL,
  PRIMARY KEY (card_id, user_id),
  KEY idx_assignee_user (user_id),
  CONSTRAINT fk_assignee_card FOREIGN KEY (card_id) REFERENCES cards(id) ON DELETE CASCADE,
  CONSTRAINT fk_assignee_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS card_labels (
  card_id  CHAR(36) NOT NULL,
  label_id CHAR(36) NOT NULL,
  PRIMARY KEY (card_id, label_id),
  KEY idx_cardlabels_label (label_id),
  CONSTRAINT fk_cardlabels_card  FOREIGN KEY (card_id)  REFERENCES cards(id)  ON DELETE CASCADE,
  CONSTRAINT fk_cardlabels_label FOREIGN KEY (label_id) REFERENCES labels(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS comments (
  id        CHAR(36)    NOT NULL DEFAULT (UUID()),
  card_id   CHAR(36)    NOT NULL,
  author_id CHAR(36)    NULL,
  body      TEXT        NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_comments_card (card_id, created_at),
  CONSTRAINT fk_comments_card   FOREIGN KEY (card_id)   REFERENCES cards(id) ON DELETE CASCADE,
  CONSTRAINT fk_comments_author FOREIGN KEY (author_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Files live on disk (VM) or Oracle Object Storage; DB keeps metadata + URL only.
CREATE TABLE IF NOT EXISTS attachments (
  id            CHAR(36)     NOT NULL DEFAULT (UUID()),
  card_id       CHAR(36)     NULL,
  card_field_id CHAR(36)     NULL,
  filename      VARCHAR(512) NOT NULL,
  url           VARCHAR(2048) NOT NULL,
  size_bytes    BIGINT       NULL,
  uploaded_by   CHAR(36)     NULL,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_attach_card (card_id),
  CONSTRAINT fk_attach_card  FOREIGN KEY (card_id)       REFERENCES cards(id)       ON DELETE CASCADE,
  CONSTRAINT fk_attach_field FOREIGN KEY (card_field_id) REFERENCES card_fields(id) ON DELETE CASCADE,
  CONSTRAINT fk_attach_user  FOREIGN KEY (uploaded_by)   REFERENCES users(id)       ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Activity log / history: moves, field edits, comments, automation actions.
CREATE TABLE IF NOT EXISTS card_events (
  id            CHAR(36)    NOT NULL DEFAULT (UUID()),
  card_id       CHAR(36)    NOT NULL,
  type          VARCHAR(48) NOT NULL,                -- created, moved, field_updated, commented, automated...
  from_phase_id CHAR(36)    NULL,
  to_phase_id   CHAR(36)    NULL,
  actor_id      CHAR(36)    NULL,                    -- null = the automation robot
  data          JSON        NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_events_card (card_id, created_at),
  CONSTRAINT fk_events_card  FOREIGN KEY (card_id)  REFERENCES cards(id) ON DELETE CASCADE,
  CONSTRAINT fk_events_actor FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Databases (tables) + records  (S13–S15)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS data_tables (
  id         CHAR(36)     NOT NULL DEFAULT (UUID()),
  org_id     CHAR(36)     NOT NULL,
  name       VARCHAR(255) NOT NULL,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_tables_org (org_id),
  CONSTRAINT fk_tables_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS table_fields (
  id       CHAR(36)     NOT NULL DEFAULT (UUID()),
  table_id CHAR(36)     NOT NULL,
  label    VARCHAR(255) NOT NULL,
  type     VARCHAR(32)  NOT NULL,
  options  JSON         NULL,
  position INT          NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_tablefields_table (table_id, position),
  CONSTRAINT fk_tablefields_table FOREIGN KEY (table_id) REFERENCES data_tables(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS table_records (
  id         CHAR(36)     NOT NULL DEFAULT (UUID()),
  table_id   CHAR(36)     NOT NULL,
  title      VARCHAR(512) NOT NULL,
  created_by CHAR(36)     NULL,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_records_table (table_id),
  CONSTRAINT fk_records_table FOREIGN KEY (table_id)   REFERENCES data_tables(id) ON DELETE CASCADE,
  CONSTRAINT fk_records_user  FOREIGN KEY (created_by) REFERENCES users(id)       ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS table_record_fields (
  id        CHAR(36) NOT NULL DEFAULT (UUID()),
  record_id CHAR(36) NOT NULL,
  field_id  CHAR(36) NOT NULL,
  value     JSON     NULL,
  PRIMARY KEY (id),
  UNIQUE KEY uq_record_field (record_id, field_id),
  CONSTRAINT fk_rf_record FOREIGN KEY (record_id) REFERENCES table_records(id) ON DELETE CASCADE,
  CONSTRAINT fk_rf_field  FOREIGN KEY (field_id)  REFERENCES table_fields(id)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Connector links: a card or record connected to another card or record.
CREATE TABLE IF NOT EXISTS item_links (
  id             CHAR(36) NOT NULL DEFAULT (UUID()),
  field_id       CHAR(36) NULL,                      -- the connector field that made the link
  from_item_type ENUM('card','record') NOT NULL,
  from_item_id   CHAR(36) NOT NULL,
  to_item_type   ENUM('card','record') NOT NULL,
  to_item_id     CHAR(36) NOT NULL,
  created_at     DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_link (field_id, from_item_id, to_item_id),
  KEY idx_link_from (from_item_type, from_item_id),
  KEY idx_link_to (to_item_type, to_item_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Automations  (S12)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS automations (
  id            CHAR(36)     NOT NULL DEFAULT (UUID()),
  pipe_id       CHAR(36)     NOT NULL,
  name          VARCHAR(255) NOT NULL,
  event_type    ENUM('card_enters_phase','field_updated','card_created','schedule','alert') NOT NULL,
  event_config  JSON         NULL,                   -- which phase/field, schedule cron, alert kind
  cond_json     JSON         NULL,                   -- optional condition filter
  action_type   ENUM('move_card','update_field','create_connected_card','create_record','notify') NOT NULL,
  action_config JSON         NULL,                   -- target phase/field/value/email
  active        TINYINT(1)   NOT NULL DEFAULT 1,
  created_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at    DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_autom_pipe (pipe_id, active),
  KEY idx_autom_event (pipe_id, event_type),
  CONSTRAINT fk_autom_pipe FOREIGN KEY (pipe_id) REFERENCES pipes(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Every time an event fires we record a run (for metering + idempotency + debugging).
CREATE TABLE IF NOT EXISTS automation_runs (
  id            CHAR(36) NOT NULL DEFAULT (UUID()),
  automation_id CHAR(36) NOT NULL,
  card_id       CHAR(36) NULL,
  status        ENUM('success','skipped','failed') NOT NULL,
  counted_task  TINYINT(1) NOT NULL DEFAULT 1,       -- Pipefy counts a task even when condition is false
  dedupe_key    VARCHAR(255) NULL,                   -- (automation,event,card) to avoid double-fire
  error         TEXT     NULL,
  created_at    DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_run_dedupe (dedupe_key),
  KEY idx_runs_autom (automation_id, created_at),
  CONSTRAINT fk_runs_autom FOREIGN KEY (automation_id) REFERENCES automations(id) ON DELETE CASCADE,
  CONSTRAINT fk_runs_card  FOREIGN KEY (card_id)       REFERENCES cards(id)       ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Public forms + portals  (S08–S10)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public_forms (
  id        CHAR(36)     NOT NULL DEFAULT (UUID()),
  pipe_id   CHAR(36)     NOT NULL,
  phase_id  CHAR(36)     NULL,                        -- null = start form; set = phase form
  slug      VARCHAR(64)  NOT NULL,
  title     VARCHAR(255) NULL,
  branding  JSON         NULL,                        -- logo, colors, description
  is_public TINYINT(1)   NOT NULL DEFAULT 1,
  closed    TINYINT(1)   NOT NULL DEFAULT 0,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_form_slug (slug),
  KEY idx_forms_pipe (pipe_id),
  CONSTRAINT fk_forms_pipe  FOREIGN KEY (pipe_id)  REFERENCES pipes(id)  ON DELETE CASCADE,
  CONSTRAINT fk_forms_phase FOREIGN KEY (phase_id) REFERENCES phases(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS portals (
  id       CHAR(36)     NOT NULL DEFAULT (UUID()),
  org_id   CHAR(36)     NOT NULL,
  slug     VARCHAR(64)  NOT NULL,
  title    VARCHAR(255) NULL,
  branding JSON         NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY uq_portal_slug (slug),
  CONSTRAINT fk_portals_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS portal_forms (
  portal_id CHAR(36) NOT NULL,
  form_id   CHAR(36) NOT NULL,
  position  INT      NOT NULL DEFAULT 0,
  PRIMARY KEY (portal_id, form_id),
  CONSTRAINT fk_pf_portal FOREIGN KEY (portal_id) REFERENCES portals(id)      ON DELETE CASCADE,
  CONSTRAINT fk_pf_form   FOREIGN KEY (form_id)   REFERENCES public_forms(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- ---------------------------------------------------------------------------
-- Reports + dashboards  (S16–S18)
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS reports (
  id         CHAR(36)     NOT NULL DEFAULT (UUID()),
  org_id     CHAR(36)     NOT NULL,
  scope      ENUM('pipe','company') NOT NULL DEFAULT 'pipe',
  pipe_id    CHAR(36)     NULL,                       -- set when scope = pipe
  name       VARCHAR(255) NOT NULL,
  config     JSON         NULL,                       -- selected fields, filters, columns
  created_by CHAR(36)     NULL,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_reports_org (org_id),
  CONSTRAINT fk_reports_org  FOREIGN KEY (org_id)  REFERENCES organizations(id) ON DELETE CASCADE,
  CONSTRAINT fk_reports_pipe FOREIGN KEY (pipe_id) REFERENCES pipes(id)         ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dashboards (
  id         CHAR(36)     NOT NULL DEFAULT (UUID()),
  org_id     CHAR(36)     NOT NULL,
  name       VARCHAR(255) NOT NULL,
  created_by CHAR(36)     NULL,
  created_at DATETIME(3)  NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  KEY idx_dash_org (org_id),
  CONSTRAINT fk_dash_org FOREIGN KEY (org_id) REFERENCES organizations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS dashboard_widgets (
  id           CHAR(36)    NOT NULL DEFAULT (UUID()),
  dashboard_id CHAR(36)    NOT NULL,
  type         ENUM('line','bar','area','table','calendar','number') NOT NULL,
  source       JSON        NULL,                      -- pipe/table + dimension + measure
  config       JSON        NULL,
  position     INT         NOT NULL DEFAULT 0,
  PRIMARY KEY (id),
  KEY idx_widgets_dash (dashboard_id, position),
  CONSTRAINT fk_widgets_dash FOREIGN KEY (dashboard_id) REFERENCES dashboards(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Seed the single internal org (edit the name):
-- INSERT INTO organizations (id, name) VALUES (UUID(), 'Minha Empresa');
