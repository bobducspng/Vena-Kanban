# Architecture: internal process app (a rebuild of Pipefy's core features)

Built on the user's **existing** infrastructure — not a greenfield stack.
Scope from `recon.md`: pipes (phases/cards/forms) + automations + reports.
For: internal use, single organization.

## Stack

Everything below already exists on the Oracle Cloud VM. The clone adds to it; it
does not replace it.

| layer | choice | why |
| --- | --- | --- |
| host | Oracle Cloud VM, Ubuntu 24.04, Ampere A1 Flex (ARM, always-free) | already running; zero cost. Deps must build for `arm64` (Node has prebuilts). |
| process | `systemd` service, config in `.env` | already how the app runs; keep one unit, add a second for the job runner (below). |
| backend | Node 22 + Express + **tRPC** | existing; tRPC gives end-to-end typed procedures for the app's own UI. |
| ORM | **Drizzle** (MySQL dialect) | TypeScript-first, SQL-close, great MySQL support, pairs well with tRPC. (Prisma is the swap.) |
| database | **MySQL 8** on the VM | existing. JSON type covers dynamic field values; InnoDB FKs for integrity. |
| auth | **Google OAuth 2.0** (existing) | reused as-is. New tables reference `users(id)`; no new login flow. |
| access rules | **data-layer checks in tRPC middleware** | MySQL has no RLS — every query is scoped by `org_id`/membership in code, not the DB. |
| public access | **ngrok** free tunnel | existing. See "parts that bite" — the ephemeral URL is the main risk. |
| files | VM disk now; **Oracle Object Storage** (always-free bucket) later | don't put blobs in MySQL; store metadata + URL in `attachments`. |
| jobs | **node-cron** in a second systemd service | no Vercel Cron here; a single worker handles schedules, due-date alerts, automations. |
| email | SMTP (e.g. your Google Workspace) or Resend | for `notify` actions and alerts; keep creds in `.env`. |

One database. One app process + one job process. No microservices.

## Schema

Full DDL in **`replica/schema.sql`** (MySQL 8). Tables: **27**.

- IDs: `CHAR(36)` UUID, `DEFAULT (UUID())`; app may also pass `crypto.randomUUID()`.
- Times: `DATETIME(3)`, always UTC (session `time_zone='+00:00'`); avoids the
  `TIMESTAMP` 2038 range limit.
- Money: integer cents + a currency column (for `currency` fields, stored in `value` JSON).
- Dynamic field values: `card_fields.value` / `table_record_fields.value` as **JSON**,
  one row per (card, field) — keeps every field type in one shape and stays queryable.
- Status/role/event/action: MySQL **ENUM**; field `type` is **VARCHAR(32)** so new
  field types need no `ALTER`.
- FKs: every one has an explicit `ON DELETE` (`CASCADE` for children, `SET NULL`
  for authorship, `RESTRICT` on `cards.current_phase_id` so a phase with cards
  can't be silently dropped).
- Access: no RLS. A `scopedDb(ctx)` helper in the data layer adds the
  `org_id`/membership filter to every read and write; public-form writes go
  through a separate, validated, unauthenticated path.

Core groups: identity (`organizations`, `users`, `memberships`), process
(`pipes`, `phases`, `fields`, `labels`), work (`cards`, `card_fields`,
`card_assignees`, `card_labels`, `comments`, `attachments`, `card_events`),
databases (`data_tables`, `table_fields`, `table_records`,
`table_record_fields`, `item_links`), automation (`automations`,
`automation_runs`), intake (`public_forms`, `portals`, `portal_forms`),
analytics (`reports`, `dashboards`, `dashboard_widgets`).

## API

The app's own UI calls **tRPC procedures** (typed). Anything an outsider or
another system hits — public forms, file downloads, inbound webhooks — is a
plain **Express REST** route, because external clients have no tRPC client.

### tRPC procedures (auth = Google session; scoped by membership)

| procedure | does | who | input | output | flow |
| --- | --- | --- | --- | --- | --- |
| `pipe.list` / `pipe.get` | list/read pipes | member | — / {pipeId} | pipes / pipe+phases+fields | F01,F02 |
| `pipe.create` | create a pipe | admin/member | {name, description?} | pipe | F01 |
| `phase.create` / `phase.update` / `phase.reorder` | manage phases | admin/member | {pipeId, name, position, ...} | phase | F01 |
| `field.create` / `field.update` / `field.reorder` / `field.delete` | manage field defs | admin/member | {phaseId, label, type, required, options?} | field | F01 |
| `card.create` | create a card from start form | member | {pipeId, title, values[]} | card | F02 |
| `card.get` / `card.list` | read cards (by phase/filter) | member | {pipeId, filter?} | cards | F02 |
| `card.updateField` | set a field value | member | {cardId, fieldId, value} | cardField | F02 |
| `card.move` | move to another phase (checks required + `version`) | member | {cardId, toPhaseId, version} | card | F02 |
| `card.assign` / `card.comment` / `card.setLabels` | assignees/comments/labels | member | {cardId, ...} | ok | F02 |
| `automation.list/create/update/toggle/delete` | manage rules | admin | {pipeId, event, condition?, action, ...} | automation | F03 |
| `table.create` / `tableField.*` / `record.create` / `record.updateField` | databases | member | {...} | table/record | F04 |
| `link.create` / `link.delete` | connector links | member | {fieldId, from, to} | link | F04 |
| `form.create/update` / `portal.create/update` | intake config | admin | {pipeId, slug, branding} | form/portal | F06 |
| `report.run` / `report.save` | pipe/company reports | member | {scope, pipeId?, config} | rows | F05 |
| `dashboard.get` / `widget.upsert` | dashboards | member | {dashboardId, widget} | widget data | F05 |

### Express REST (public / machine)

| method path | does | who | flow |
| --- | --- | --- | --- |
| `GET /f/:slug` | render a public form | anyone | F06 |
| `POST /f/:slug` | submit a public form → create card (rate-limited, captcha) | anyone | F06 |
| `GET /p/:slug` | render a portal (many forms) | anyone | F06 |
| `GET /files/:id` | download an attachment | member/guest per card | F02 |
| `GET /auth/google` · `GET /auth/google/callback` | existing Google OAuth | anyone | login |
| `POST /webhooks/email` | email-to-card inbox (optional, could-have) | mail provider | F06 |

Webhooks in: email-to-card (optional). Webhooks out: none required for internal use.
Jobs (node-cron worker): **schedule automations** (per-minute tick), **due-date
alerts** (mark `late`, send `notify`), **nightly `mysqldump` backup**.

## The parts that bite

- **ngrok free URL is ephemeral.** It changes on every restart, which breaks the
  Google OAuth redirect URI, every public-form/portal link, and any webhook.
  *Fix:* claim ngrok's one free **static domain**, put it in `.env` as
  `PUBLIC_BASE_URL`, and register that redirect in Google Cloud Console. Build
  all form/portal links from `PUBLIC_BASE_URL`, never from the request host.
- **No RLS in MySQL.** One query that forgets its `org_id`/membership filter
  leaks data. *Fix:* funnel every query through `scopedDb(ctx)`; forbid raw
  model access in route code; add a test that asserts cross-org reads return empty.
- **Automation loops & metering.** An `update_field` action can trigger another
  `field_updated` automation → infinite loop. *Fix:* cap run depth per originating
  event, write an `automation_runs` row with a `dedupe_key` (unique) before acting,
  and count a task even when the condition is false (Pipefy's behaviour).
- **Concurrent card moves.** Two users move the same card at once. *Fix:*
  optimistic lock — `card.move` sends the `version` it read; the UPDATE does
  `WHERE id=? AND version=?` and bumps it; a 0-row result returns a conflict.
- **Required-field gate.** `card.move` must verify every required field of the
  current phase is filled **inside the same transaction** as the move.
- **Time zones.** Store UTC; compute `late`/due in UTC; format to the viewer's tz
  in the UI only. MySQL session pinned to `+00:00`.
- **JSON reporting cost.** Filtering/sorting on `value` JSON is slower at scale.
  Fine for internal volume; if a report gets heavy, add a generated column +
  index on the hot field.
- **ARM + single VM.** Deps must have `arm64` builds (Node fine; check native
  modules). No HA — rely on the nightly dump; test a restore once.
- **File limits.** Cap upload size in Express before it hits disk; the always-free
  VM has limited storage, so move large files to Oracle Object Storage early.

## Build order

1. **Vertical slice (ugly, end to end).** Log in with Google → create a pipe with
   3 phases → add a few start-form fields → create a card → fill fields → move it
   phase to phase → see it reach the end phase.
   Screens S01, S02, S03, S06, S07, S11 · Tables organizations, users,
   memberships, pipes, phases, fields, cards, card_fields, card_events ·
   Procedures pipe.create, phase.create, field.create, card.create,
   card.updateField, card.move. *Proves the stack on the real VM.*
2. **Must-haves** (`features.csv`): full field catalogue, kanban drag + list view,
   assignees, labels, comments, attachments, databases + connector fields.
   S04, S13–S15 · + data_tables, table_*, item_links, card_assignees,
   card_labels, comments, attachments.
3. **Should-haves:** automations (S12 + automations/automation_runs + job worker),
   public forms & portals (S08–S10), calendar view (S05), pipe reports (S16),
   roles/permissions enforcement (S19), due-date alerts/email.
4. **Could-haves:** company reports (S17), BI dashboards (S18), conditional form
   logic, templates (S20), email-to-card, bulk actions.
5. **Fixes from `replica-entrepreneur`**, once it has run.

---
Stack: Node 22 + Express + tRPC + Drizzle on MySQL 8, Google OAuth, on the
existing Oracle Cloud VM behind ngrok. · Tables: 27 · Procedures+routes: ~35.
Riskiest: (1) ngrok ephemeral URL vs OAuth/forms, (2) the automation engine
(loops, metering, idempotency), (3) no-RLS data scoping in code.
Next step: `/replica-design`.
