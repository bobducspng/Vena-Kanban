# Backend

Built on the existing infra: **Node 22 + Express + tRPC + Drizzle/MySQL 8** on the
Oracle Cloud VM, **Google OAuth 2.0**, session cookies, behind ngrok. Lives in
`server/`. No Stripe/payments — internal use, out of scope.

Status: `npm run build` and `npm run typecheck` pass (0 errors). Migrations
generated (`server/drizzle/0000_init.sql`, 28 tables). **Not yet run against a
live MySQL** (none in this environment) — run `db:migrate` + `db:seed` on the VM
to exercise it.

## Layout

```
server/
  src/env.ts                 zod-validated environment (fails fast on boot)
  src/db/client.ts           mysql2 pool + Drizzle (timezone UTC)
  src/db/schema.ts           28 tables, mirrors replica/schema.sql
  src/db/migrate.ts          applies ./drizzle migrations
  src/auth/google.ts         Google OAuth2 (your own app), id_token verified
  src/auth/session.ts        server sessions + http-only secure cookie
  src/trpc/trpc.ts           context (user+org from cookie), protected/admin procedures, assertPipeInOrg
  src/trpc/routers/*         user, pipe, phase, field, card, event — match the front-end's api shape
  src/http/authRoutes.ts     /auth/google, /auth/google/callback, /auth/logout
  src/index.ts               express: helmet, cors(credentials), rate-limit /auth, mount /trpc
  src/jobs.ts                second service: due-date sweep (automation hook marked TODO)
  src/seed.ts                realistic fake data (no real people), idempotent
  .env.example               every var name, no values
```

## Auth

- Google OAuth 2.0 with **your own** developer app (never Pipefy's client). Scopes:
  `openid email profile` (fewest needed). Redirect built from `PUBLIC_BASE_URL`.
- CSRF: random `state` in an http-only cookie, verified on callback.
- Sessions: random 32-byte token in a **http-only, SameSite=Lax, Secure-in-prod**
  cookie; server-side `sessions` table with 30-day expiry; `/auth/logout` destroys it.
- User upserted by Google `sub`; first login joins the single internal org as `admin`.
- **Pending:** account deletion endpoint; "sign out everywhere".

## Database

- Drizzle schema → `drizzle/0000_init.sql` migration, checked in, applied by
  `npm run db:migrate`.
- **Access rules in the data layer (no RLS in MySQL):** every procedure is
  `protectedProcedure` (requires a session + org); pipe-scoped reads/writes go
  through `assertPipeInOrg(pipeId, orgId)` — the single authorization choke point.
  Card/field/event procedures resolve the card's pipe and assert it too.
- Required-field gate enforced server-side on `card.create` and `card.move`.
- Optimistic lock on `card.move` (`version` check) for concurrent moves.
- Seed script with fake people. Backups: enable the VM's `mysqldump` cron
  (nightly) — see architecture.md; **action item on the VM**.

## Email and jobs

- `jobs.ts` runs as a second systemd service and sweeps due dates (`late` flag)
  each minute. The automation engine (schedule/alert events) plugs in at the
  marked TODO during the automations milestone.
- **Pending:** transactional email (Resend/Postmark or Google Workspace SMTP) for
  `notify` actions and due-date alerts; dead-letter log.

## Integrations

- None required for internal use. Public-form intake and email-to-card are REST
  routes planned in `architecture.md`, not built yet.

## Security checklist

- [x] secrets only in env vars; `.env` in `.gitignore`; `.env.example` has names only; nothing in client bundles
- [x] input validated on the server with zod on every procedure that takes input
- [~] authorization checked on every read and write (protectedProcedure + assertPipeInOrg) — **logic in place; not yet tested with a second user against a live DB** (do this on the VM: a second org's user must get nothing back)
- [x] rate limits on the auth endpoints (`express-rate-limit` on `/auth`)
- [n/a] webhooks verify signatures — no webhooks/Stripe in scope
- [ ] uploads: size/type limits — attachments not built yet; JSON body capped at 1 MB
- [x] no user data in URLs; **scrub the OAuth catch-block log** before prod (it prints the error object) — action item
- [~] dependencies audited (`npm audit`): **4 moderate, all dev-only** via `drizzle-kit → esbuild` (dev server advisory); not in the production runtime. Did not force the breaking downgrade.
- [ ] privacy policy lists processors (Google, host) — add before any external exposure

## Wiring the front-end (small follow-up)

The routers match the fake data layer's function names exactly, so swapping is
local to the front-end: replace `app/src/data/store.ts` with a tRPC client
(`@trpc/client` + `@trpc/react-query`) that imports `AppRouter` from
`server/src/trpc/routers/_app.ts`, keeping the same `api.pipe.list()` etc. call
sites. No screen code changes.

## Next

`/replica-test`.
