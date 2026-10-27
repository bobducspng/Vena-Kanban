# Recon map: Pipefy (Web app)

Scope: Core process loop — **Pipes** (phases, cards, forms) + **Automations** + **Reports/Dashboards**
For: Internal use in the user's own business (not a product to sell)
Date: 2026-10-26

> Clean-room recon. Built only from public sources (help center, developer/API
> docs, pricing, glossary). No source code, no private APIs, no scraping, no
> non-owned account. Screenshots, when added, live in `replica/screens/` and are
> reference only — they never ship in the clone. This maps *functionality and
> UX*, not anything Pipefy owns (brand, name, templates, partner network).

## Sources

| # | source | URL | notes |
| --- | --- | --- | --- |
| 1 | What are pipes | https://help.pipefy.com/en/articles/614606-what-are-pipes | pipe = a process; cards flow through phases |
| 2 | What are phases | https://help.pipefy.com/en/articles/614592-what-are-phases | phases = columns/steps; required fields gate movement |
| 3 | What is a card | https://help.pipefy.com/pipefy-s-basic-concepts/what-is-a-card | card = one demand; created from the start form |
| 4 | Moving cards through the pipe | https://help.pipefy.com/en/articles/614653-moving-cards-through-the-pipe | drag/drop or open card; one phase at a time by default |
| 5 | Choosing pipe views | https://help.pipefy.com/en/articles/3143190-choosing-pipe-views | Kanban / list / calendar views |
| 6 | What is kanban view | https://help.pipefy.com/en/articles/6004057-what-is-kanban-view | phase = column layout |
| 7 | Create a start form | https://help.pipefy.com/en/articles/614596-create-a-start-form | one start form per pipe; submission = new card |
| 8 | Start/update processes with forms | https://help.pipefy.com/en/articles/5137219-start-and-update-processes-with-forms | start / phase / public / internal forms |
| 9 | How to customize the public form | https://help.pipefy.com/en/articles/1096410-how-to-customize-the-public-form | public form, no login needed |
| 10 | How to share forms | https://help.pipefy.com/en/articles/7833696-how-to-share-forms | portals = several public forms on one page |
| 11 | Field types | https://help.pipefy.com/en/articles/625205-field-types | UI field catalogue |
| 12 | How to create automations | https://help.pipefy.com/en/articles/686823-how-to-create-automations | event -> (condition) -> action |
| 13 | Set up an automation event | https://help.pipefy.com/en/articles/6272628-set-up-an-automation-event | trigger catalogue |
| 14 | What are automation conditions | https://help.pipefy.com/en/articles/781230-what-are-automation-conditions | optional condition filter |
| 15 | Pipefy Glossary | https://help.pipefy.com/en/articles/6584987-pipefy-glossary | databases, reports, dashboards definitions |
| 16 | Business vs Enterprise plans | https://help.pipefy.com/en/articles/5714249-business-vs-enterprise-plans-what-s-the-difference | which features are gated |
| 17 | Pricing | https://www.pipefy.com/pricing/ | plan tiers and limits |
| 18 | Automation/API limits | https://help.pipefy.com/en/articles/5419654-what-to-do-when-reaching-your-automation-integration-or-api-limit | per-plan automation/API caps |
| 19 | GraphQL API — Pipe/Phase/Card | https://api-docs.pipefy.com/reference/overview/Pipe/ | data model: Pipe, Phase, PhaseField, Card |
| 20 | GraphQL API — Table/TableRecord | https://api-docs.pipefy.com/reference/objects/Table/ | data model: Table, TableRecord, TableRecordField |
| 21 | Developer docs — Fields | https://developers.pipefy.com/reference/fields | API field type strings |

## Core loop

A team models a business process as a **pipe** (a board of ordered **phases**);
work items enter as **cards** via a **form** and are pushed phase-by-phase to
completion, with **automations** reacting to events and **reports/dashboards**
reading the accumulated card data.

## Screens

| ID | screen | route / how to reach | purpose | key components | states seen |
| --- | --- | --- | --- | --- | --- |
| S01 | Login / org picker | /login | auth, pick organization | form inputs, button | empty, error, loading |
| S02 | Organization home | /organizations/:id | list of pipes & databases, create new | nav sidebar, card grid, "new" menu | empty (no pipes), filled |
| S03 | Pipe — Kanban view | /pipes/:id | phases as columns, cards as tiles, drag between | phase column, card tile, add-card (+), filters, search | empty phase, filled, WIP limit, loading |
| S04 | Pipe — List/Table view | /pipes/:id (list) | tabular rows of cards, bulk ops | data table, column picker, inline edit | empty, filled, filtered |
| S05 | Pipe — Calendar view | /pipes/:id (calendar) | cards with a due date on a calendar | calendar grid, card chip | no due dates, filled, month/week/day |
| S06 | Card detail | card modal/drawer | all fields, assignees, comments, history, attachments, connections | modal, field controls, comment thread, activity log, connection chip | new, filled, required-missing, moving-blocked |
| S07 | Start form (internal) | + on pipe | create a card from start fields | form renderer, field controls, submit | empty, validation error, success |
| S08 | Public form | public link | external request without login | branded form, field controls, captcha | empty, submitted, closed |
| S09 | Portal | portal link | several public forms on one page | portal layout, form cards, branding | empty, filled |
| S10 | Phase form | phase form link | collect/update data for a phase externally | form renderer | empty, submitted |
| S11 | Pipe settings / phase editor | pipe settings | add/reorder phases, define fields, forms, labels | phase editor, field palette (drag), form builder, required toggle | default, editing, conditional-logic |
| S12 | Automations | pipe automations | list + build event->condition->action rules | rule list, event picker, condition builder, action picker | none, list, builder, metered-usage warning |
| S13 | Databases list | /organizations/:id (databases) | list of database tables | grid, new-table | empty, filled |
| S14 | Database table | /tables/:id | spreadsheet-like records | data grid, record row, new-record, statuses | empty, filled |
| S15 | Database record detail | record modal | one record's fields & connections | modal, field controls, connection chip | new, filled |
| S16 | Pipe report | pipe reports | customizable table/export of card data | report builder, filters, column picker, export | empty, filled |
| S17 | Company report | org reports | cross-pipe aggregate report | report builder, filters | empty, filled |
| S18 | Dashboards (BI) | dashboards | charts/metrics over process data | chart widgets (line/bar/area/table/calendar), builder, filters | empty, configured |
| S19 | Members & permissions | org/pipe settings | roles, private processes, guests | member list, role picker, invite | admin, member, guest |
| S20 | Templates gallery | new pipe > template | start a pipe from a prebuilt template | template cards, preview | browse, applied |

## Flows

```
F01 Build a pipe from scratch
    S02 org home -> S11 create pipe -> S11 define phases -> S11 add fields to start form & phases
    happy path clicks: ~8-12 (new pipe, name, add 3-4 phases, add fields)
    edge: delete phase loses its cards; required field with no value; duplicate field names

F02 Start a card and move it to done
    S03 kanban -> S07 start form -> submit -> S06 card detail -> fill phase fields -> move phase -> ... -> end phase
    happy path clicks: ~2 to create + 1 per phase move
    edge: required field blocks the move; move only one phase at a time; card late/overdue alert

F03 Create an automation
    S12 automations -> pick event (card enters phase / field updated / card created / schedule / alert)
        -> optional condition -> pick action (move card, update field, create connected card/record, notify)
    happy path clicks: ~5-7
    edge: metered task counted even when condition is false; action targets a deleted phase/field

F04 Database table connected to a pipe
    S13 databases -> S14 new table + fields -> S11 add Database Connection field on pipe
        -> S06 card links to a record
    happy path clicks: ~6-10
    edge: connector set to create-new vs connect-existing vs multiple; orphaned connection

F05 Report / dashboard over card data
    S16 pipe report -> choose fields/filters -> save/export   |   S18 dashboard -> add chart -> bind to pipe/field
    happy path clicks: ~5-8
    edge: empty data; field type mismatch for a chart; cross-pipe join in company report

F06 Receive an external request
    S11 configure public form -> S08 share link (or S09 portal) -> external submit -> new card in S03
    happy path clicks: 1 to share, external fills the rest
    edge: form closed; spam/captcha; required field missing; email-to-card inbox
```

## Components

| component | variants | states | used on |
| --- | --- | --- | --- |
| Button | primary, secondary, ghost, danger | default, hover, focus, disabled, loading | all |
| Field control | short_text, long_text, email, phone, number, currency, date, datetime, due_date, time, select (dropdown), radio, checkbox, label_select, assignee_select, attachment, id, statement, connector (pipe/db connection), dynamic_content | default, focus, filled, required-empty, error, disabled | S06, S07, S08, S10, S11, S14, S15 |
| Card tile | normal, overdue/late, blocked | default, hover, dragging, selected | S03 |
| Phase column | normal, start, end-of-process | empty, filled, WIP limit | S03, S11 |
| Modal / drawer | card, record, confirm | open, closing | S06, S15 |
| Data grid | pipe list, database table, report | empty, filled, sorting, inline-edit | S04, S14, S16, S17 |
| Form builder | start, phase, public, portal | editing, drag, conditional-logic | S11 |
| Rule row (automation) | event, condition, action | configured, invalid, metered-warning | S12 |
| Chart widget | line, bar, area, table, calendar | empty, configured | S18 |
| Connection chip | to pipe, to database | linked, create-new, broken | S06, S15 |
| Nav sidebar | org, pipe, settings | collapsed, expanded | all |
| Filter / search bar | field filter, text search | empty, active | S03, S04, S14, S16 |
| Avatar / assignee | user, guest | default, group | S03, S06 |
| Label / tag | color set | default | S03, S06, S11 |
| Toast / alert | success, error, info | shown, dismissed | all |
| Activity log / comments | system event, user comment | empty, filled | S06 |

## Inferred data model

```
Organization    id, name, members, pipes, tables, plan
                evidence: S02 org home, pricing tiers
                confidence: high

User / Member    id, name, email, role (admin|member|guest), avatar
                 evidence: S19 members, assignee_select field, API Card.assignees
                 confidence: high

Pipe            id, name, description, phases[], start_form_fields[], labels[], members
                evidence: S03, help "What are pipes", API Pipe object
                confidence: high

Phase           id, pipe_id, name, color, description, index, is_end, fields[]
                evidence: S11 phase editor, help "What are phases", API Phase/overview
                confidence: high

PhaseField      id, phase_id, label, type, required, options[], index, editable
                (type ∈ short_text, long_text, email, phone, number, currency, date,
                 datetime, due_date, time, select, radio_*, checklist_*, label_select,
                 assignee_select, attachment, id, statement, connector, dynamic_content,
                 cpf, cnpj)
                evidence: help "Field types", developers.pipefy.com/reference/fields, API PhaseField
                confidence: high

Card            id, pipe_id, title, current_phase_id, assignees[], labels[],
                created_at, created_by, due_date, done, late
                evidence: S06 card detail, help "What is a card", API Card object
                confidence: high

CardField       card_id, field_id, value, native_value, filled_at
                evidence: API Card.fields (name/value/filled_at)
                confidence: high

Comment         id, card_id, author_id, text, created_at
                evidence: S06 comment thread
                confidence: medium

Attachment      id, card_id/field_id, filename, url, size
                evidence: attachment field type, S06
                confidence: high

Automation      id, pipe_id, event (trigger), condition (optional), action, active
                (event ∈ card_enters_phase, field_updated, card_created, schedule, alert)
                (action ∈ move_card, update_field, create_connected_card, create_record, notify)
                evidence: help "How to create automations", "automation event", "conditions"
                confidence: high

Table (database) id, org_id, name, table_fields[], statuses[], records[]
                evidence: S14, API Table object, glossary "database"
                confidence: high

TableRecord     id, table_id, title, created_at, record_fields[]
                evidence: API Table Records, developers "table-records"
                confidence: high

TableRecordField record_id, field_id, value, native_value, report_value
                evidence: API TableRecordField object
                confidence: high

Connector       id, source(card|record), target(pipe|table), mode(create|connect|multiple)
                evidence: connector field type docs, API connector
                confidence: high

Report          id, scope(pipe|company), fields[], filters[], output(table|export)
                evidence: glossary "reports", S16/S17
                confidence: medium

Dashboard/Chart id, name, widgets[] (type, source pipe/table, dimension, measure)
                evidence: glossary "dashboards", S18
                confidence: medium
```

Relationships: Organization 1-n Pipe; Pipe 1-n Phase; Phase 1-n PhaseField;
Pipe 1-n Card; Card 1-n CardField; Card n-n User (assignees); Organization 1-n
Table; Table 1-n TableRecord; TableRecord 1-n TableRecordField; Connector links
Card/Record -> Pipe/Table; Pipe 1-n Automation; Pipe/Organization 1-n Report;
Organization 1-n Dashboard 1-n Chart.

## Feature matrix

See `features.csv`. Must: 16, should: 10, could: 7, skip: 5.

## Out of scope (cannot or should not be cloned)

- **The Pipefy brand** — name, logo, wordmark, copy, visual identity. The clone
  gets its own name and look (that is `replica-brand`'s job).
- **Template gallery content** — Pipefy's library of prebuilt process templates
  is their content; build your own templates.
- **Partner / integration marketplace** — the hosted network of third-party
  connectors (iPaaS, 300+ app integrations) is a business network, not a feature
  you rebuild. You can build a handful of your own integrations instead.
- **AI credits / their hosted models** — metered AI features are a vendor
  offering; wire your own model if wanted.
- **Enterprise infra as differentiators** — SSO, SOC/ISO certifications, SLAs.
  Buildable, but they are compliance/ops work, not a UX to copy.
- **Their customers' data and the multi-tenant network** — obviously not part of
  any clone.

## Size

Screens 20, flows 6, entities ~18. Hard parts:
- **Form builder** with drag-drop fields + conditional logic (S11).
- **Automation engine** — an event bus with condition evaluation + metered tasks (S12).
- **Database tables + connectors** — relational links across pipes/tables (S13–S15).
- **Reports + BI dashboards** — a small query/aggregation + charting layer (S16–S18).
- **Realtime kanban** — drag/move reflected live for a team (S03).
- **Permissions** — roles, private processes, public/guest form access (S19).

Size: **L** (a quarter) for a faithful internal-use clone of this slice; trends
**XL** if the dashboard/BI layer and conditional-logic form builder are built to
full fidelity. Recommend sequencing: pipes+cards+forms first (M), then
automations, then reports/dashboards.

Next step: `/replica-architect` to turn this into a real schema and build plan.
