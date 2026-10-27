# Build log

Stack: Vite + React + TypeScript, Tailwind v3 (design tokens), Radix primitives,
React Router, TanStack Query, @dnd-kit (installed, not yet wired), lucide-react
icons. Data layer is **fake/in-memory** (`src/data/store.ts`) with async functions
named like the future tRPC procedures — swapping in the real Express+tRPC+MySQL
backend changes only that file, not the screens.

Clean-room: every line, label and empty state written here. No Pipefy code, copy,
assets or CDN. The accent colour is a neutral placeholder (replica-brand swaps it).

Build: `npm run build` passes with 0 TypeScript errors. Preview serves HTTP 200.

| screen | id | date | status | notes |
| --- | --- | --- | --- | --- |
| App shell | — | 2026-10-27 | done | sidebar + header + routing for all screens; responsive (sidebar hides < md) |
| Design system check | — | 2026-10-27 | done | `/design` route shows every primitive and its states |
| Login | S01 | 2026-10-27 | done | fake sign-in for the slice; real app uses existing Google OAuth |
| Org home (pipes list) | S02 | 2026-10-27 | done | list + empty state + create-pipe modal |
| Pipe kanban | S03 | 2026-10-27 | done | phases as columns, cards, add-card, open card; loading + empty states |
| Card detail | S06 | 2026-10-27 | done | fields (editable), phase move (required-gated), activity log |
| Start form | S07 | 2026-10-27 | done | renders start-phase fields, required validation + inline errors |
| Pipe settings / phase editor | S11 | 2026-10-27 | stub | planned: phase editor, form builder, members |
| Automations | S12 | 2026-10-27 | stub | planned: rule list + event→condition→action builder |
| Databases | S13 | 2026-10-27 | stub | planned: tables, records, connector fields |
| Reports | S16 | 2026-10-27 | stub | planned: pipe/company reports, dashboards |
| List view / Calendar / Public form / Portal / Record detail / Dashboards | S04,S05,S08–S10,S15,S18 | — | not started | later milestones |

## Vertical slice — working end to end

Login → create a pipe (seeds 3 default phases + a required "Título" field) →
open the kanban → "Novo card" opens the start form → required fields are enforced
→ card appears in the first phase → open it → move it phase by phase → reaching
the end phase marks it **Concluído**. The required-field gate blocks a move when a
required field is empty (toast + inline error).

## Honest status / what was harder or deferred

- **Drag-and-drop** on the kanban is **not wired** yet. Moving a card is done from
  the card detail (prev/next buttons) — fully keyboard-accessible, which the design
  spec requires anyway. @dnd-kit is installed; drag is a follow-up (must keep the
  keyboard path).
- **Field editor / form builder (S11)** is the biggest remaining must-have. Pipes
  are created with sensible default phases/fields, but customizing them in the UI
  is not built — only the data model supports it.
- **Assignees, comments, attachments, card labels** render where they exist in seed
  data but can't be edited yet.
- **Screenshots for replica-diff were not captured** — no headless browser in this
  environment. Run `npm run dev` and capture S02/S03/S06/S07 into
  `replica/clone-screens/` at 1440px and 390px before running replica-diff.

## Front-end ↔ backend wiring (done)

`app/src/data/store.ts` now backs `api` with a **typed tRPC client**
(`app/src/lib/trpc.ts`, `createTRPCClient<AppRouter>`), importing the server's
`AppRouter` type from `server/dist`. Server outputs are mapped to the app's
domain types, so **no screen changed**. Repo is now an npm **workspace**
(`app` + `server`); build order is server first (emits the `.d.ts` the app's type
import needs): `npm run build` at the root does both. Login now redirects to the
backend Google OAuth (`/auth/google`). Set `VITE_API_URL` in `app/.env.local`.

Known gap: assignee avatars (Header, PipeKanban) still resolve against
`src/data/seed.ts` (demo) instead of `api.user.list` — cosmetic, fix by fetching
users.

## Testing (replica-test)

Plan in `replica/test-plan.md` (F01 + F02 cases; F03–F06 blocked on stubs).
Playwright specs in `e2e/` (`f01-pipe`, `f02-card`) with an axe scan per screen
and a `global-setup` that seeds a session row to bypass real Google OAuth in
tests (no auth backdoor added). Bugs from the code review in `replica/bugs.md`:
**0 S1**, 1 S2 (BUG-001 no auth guard — deslogado cai em tela vazia), 3 S3,
1 S4, +1 S3 de identidade. All pending reproduction on a running stack.

Not executed here: this Windows box has no MySQL and no OAuth creds, and the
front now needs the live stack. Specs run on the VM / CI (see `e2e/README.md`).

## Fix loop (done — pending verde on the VM)

All 6 bugs from `bugs.md` fixed, each with a regression spec; monorepo build
passes (0 errors). Not run here (no MySQL/OAuth on this box).

- **BUG-001** (S2) auth guard: `RequireAuth` on protected routes → `/login` on 401.
- **BUG-002** (S3) Header shows the real user (`user.me`), not the seed.
- **BUG-006** (S3) logout menu → POST `/auth/logout`.
- **BUG-003** (S3) card detail shows all fields grouped by phase.
- **BUG-005** (S3) `version` sent on move; CONFLICT handled.
- **BUG-004** (S4) assignee avatars resolved via `api.user.list`.

Seed gained a mid-phase optional field ("Parecer da análise") and an assignee
(Ana on the "Notebooks…" card) to exercise BUG-003/BUG-004.

## Next

- On the VM: migrate + **re-seed** (seed changed), backend up, `npx playwright
  test` to confirm green.
- Then `/replica-diff` (capture screenshots at 1440px/390px first).
