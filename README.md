# PreMDB

Predict the eventual IMDb rating of unreleased movies, and score points when
they settle.

This is the **v10** build: the v9 MVP (security hardening + community
consensus + snapshot-driven auto-settlement) plus authorization hardening —
admin status moved out of the client-writable `profiles.role` column into an
unforgeable JWT claim, closing a self-service privilege-escalation path — and
reliability fixes (distinct leaderboard error state, a DB-level snapshot
rating guard, UTC-explicit range cutoffs).

---

## Overview

- Users browse upcoming unreleased movies and predict their future IMDb rating
  to one decimal place.
- When a movie settles (at least 28 days past release), points are awarded and
  the leaderboard updates.
- The daily cron records a rating snapshot per movie in the settlement window
  (`rating_snapshots`) and auto-settles each day-28+ movie from the **first
  snapshot taken on or after day 28** — the displayed rule, literally.
- Admins can settle manually at any time; manual settlement remains the
  override path for any movie regardless of snapshot state.
- Once predictions lock, the movie page reveals the community consensus
  (median + histogram) — never before lock.

---

## Product rules

- One prediction per user per movie (unique DB constraint).
- Predictions allowed only while `prediction_locks_at > now()`. "Locked" is
  derived from time — it is **not** a persisted movie status.
- A movie becomes settlement-eligible once **28 days** have passed since the
  chosen release date (`SETTLEMENT_WINDOW_DAYS` in
  `lib/settlement/eligibility.ts`; the `settle_movie` RPC hardcodes the same
  28 — keep them in sync).
- The official result is the first daily rating snapshot on or after day 28.
  v1 snapshots come from **TMDb as a stated proxy for IMDb**;
  `settlements.source_type` / `source_snapshot` record this provenance.
- Settlement guards (DB constraints): `official_rating` must be 1.0–10.0 and
  `settlement_snapshot_date >= eligible_from_date`. `eligible_from_date` is
  computed inside the RPC from `release_date_used + 28` — never trusted from
  the caller.
- Community consensus (median, mean, 0.5-bucket histogram) is revealed only
  after predictions lock, and only with **3 or more** predictions. Both gates
  are enforced inside the SQL functions (see "Community consensus" below).
- Movie statuses: `upcoming`, `released_waiting_window`, `awaiting_review`,
  `settled`, `canceled`.

Display rule text verbatim where relevant:

> "This movie settles at the first daily IMDb snapshot taken on or after 28
> days post-release."

### Scoring

```
base  = max(0, round(100 - 20 × |prediction − actual|))
bonus = +10 if round(prediction × 10) == round(actual × 10) else 0
points = base + bonus
```

Examples (base only):

| |prediction − actual| | base |
|---|---|
| 0.0 | 100 |
| 0.5 | 90 |
| 1.0 | 80 |
| 2.0 | 60 |
| 5.0+ | 0 |

The Postgres `settle_movie` RPC and `lib/scoring/index.ts` implement the same
formula — keep them in sync if you change one.

---

## Stack

| Concern | Choice |
|---|---|
| Framework | Next.js 15, App Router |
| Language | TypeScript |
| Styling | Tailwind CSS + shadcn/ui |
| Database | Supabase Postgres |
| Auth | Supabase Auth (magic link only) |
| Data access | `@supabase/ssr` on the server, `@supabase/supabase-js` in the browser |
| Validation | Zod 4 |
| Writes | Server actions + route handlers |
| Cron | One authenticated route handler for lifecycle transitions |
| Tests | Vitest (unit + live-DB integration) |

No Prisma. No Auth.js. No route groups. Dark mode by default. RLS enabled on
every table.

---

## Folder map

```
app/                    — routes (flat, no route groups)
  page.tsx              landing
  login/                magic-link form
  verify-request/       "check your email"
  auth/callback/        exchanges code for session
  movies/[id]/          detail + prediction form
  dashboard/            tabs (active picks + settled)
  leaderboard/          weekly / monthly / all-time
  admin/                single-page console (Movies / Sync / Settlements)
  api/
    admin/tmdb-sync/    admin-only POST for TMDb upsert
    cron/check-movie-lifecycle/   Vercel Cron endpoint

components/             UI: ui/ layout/ movies/ predictions/ dashboard/ admin/ leaderboard/ auth/
  movies/consensus-panel.tsx       post-lock community consensus card
  movies/settlement-countdown.tsx  snapshot + "settles in N days" card
lib/
  supabase/             server, client, middleware helpers (@supabase/ssr)
  auth/                 admin.ts + server actions
  validations/          all Zod schemas
  scoring/              pure scoring math (unit tested)
  settlement/           pure eligibility + settlement service + cron phases (auto.ts)
  leaderboard/          server-side aggregation (aggregate.ts is pure/testable)
  movies/               display-state derivation + TMDb URL helpers
  predictions/          server actions + delete service + consensus math
  tmdb/                 client + sync
  admin/                server actions
supabase/
  migrations/           forward-only — never edit an existing file here
    001_initial.sql               schema + RLS + profile auto-create trigger
    002_settlement_rpc.sql        atomic settle_movie(...)
    003_contract_day28.sql        day-28 contract status constraint
    004_auto_settlement_snapshots.sql  (deprecated) movies.tmdb_*_snapshot columns
    005_settle_movie_authz.sql    in-function admin/service-role check + grants
    006_score_events_public_read.sql   public leaderboard reads
    007_settlement_guards.sql     rating range + snapshot>=eligible constraints;
                                  eligible_from_date computed in the RPC
    008_votes_optional.sql        official_num_votes nullable / default null
    009_consensus_read.sql        get_prediction_consensus / get_prediction_stats
    010_rating_snapshots.sql      daily rating_snapshots table
    011_profiles_column_privileges.sql  lock down profiles UPDATE/INSERT columns
    012_admin_via_jwt.sql         admin_users + custom_access_token hook + is_admin()
    013_snapshot_rating_check.sql rating_snapshots rating 1.0-10.0 constraint
  seed.sql              sample movies + settlement
tests/
  unit/                 scoring, eligibility, utils, leaderboard, consensus (no DB)
  integration/          predictions, settlement, leaderboard, consensus,
                        snapshots (live DB, self-skip)
types/                  supabase.ts + domain aliases
middleware.ts           session refresh + protected-route redirects
next.config.ts          TMDb remote images
vercel.json             cron schedule
```

---

## Local setup

```bash
cp .env.local.example .env.local      # fill in real values (see below)
npm install
# apply every file in supabase/migrations/ (001 through 010, in order)
# to your Supabase project
npm run dev
```

The app is available at `http://localhost:3000`.

### Env vars

All six are required for full functionality.

```bash
NEXT_PUBLIC_SUPABASE_URL="https://xxxx.supabase.co"
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY="sb_publishable_..."
SUPABASE_SERVICE_ROLE_KEY="eyJ..."           # server-only, never ship to client
TMDB_READ_ACCESS_TOKEN="eyJ..."               # v4 read access token
ADMIN_EMAILS="you@yourdomain.com,other@..."  # comma-separated
CRON_SECRET="long-random-string"             # used by /api/cron/*
```

Naming is intentional:

- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (not `ANON_KEY`) — matches current
  Supabase naming convention.
- `SUPABASE_SERVICE_ROLE_KEY` is server-only; never import it from client code.
- `CRON_SECRET` gates `/api/cron/check-movie-lifecycle`. Generate with
  `openssl rand -hex 32`.

### Supabase project

1. Create a project at [supabase.com](https://supabase.com/).
2. Copy the Project URL into `NEXT_PUBLIC_SUPABASE_URL`, the **publishable key**
   (anon) into `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and the **service role
   key** into `SUPABASE_SERVICE_ROLE_KEY`.
3. Add `http://localhost:3000/auth/callback` (and your Vercel preview /
   production URLs) under **Authentication → URL Configuration → Redirect URLs**.
4. Apply migrations. Easiest path for a hosted project: open the **SQL Editor**
   and paste every file in `supabase/migrations/` **in numeric order**
   (`001_initial.sql` … `013_snapshot_rating_check.sql`). Migrations are
   forward-only: never edit an applied file; add a new numbered one instead.
5. Enable the custom access token hook (see **Admin authorization** below) —
   migration `012` defines it but does not activate it.
6. (Optional) paste `supabase/seed.sql` for sample movies.

If you're using the Supabase CLI against a local stack:

```bash
supabase db reset        # applies everything in supabase/migrations/*.sql
psql "$DATABASE_URL" -f supabase/seed.sql
```

### Generate types

After migrations are applied:

```bash
# Hosted project
supabase gen types typescript --project-id <your-project-ref> > types/supabase.ts

# Local stack
npm run db:types
```

`types/supabase.ts` ships with a hand-written version that mirrors the schema
so the app type-checks before you run the generator.

### Seed data

`supabase/seed.sql` inserts 6 sample movies covering every lifecycle state and
one seeded settlement. Predictions and score events are left as a commented
template — fill in a real user UUID first (create a test user in the Supabase
dashboard, then grab its id from `auth.users`).

### TMDb setup

Create a free account at [themoviedb.org](https://www.themoviedb.org/), open
**Settings → API**, and copy the **v4 Read Access Token** (JWT-looking string)
into `TMDB_READ_ACCESS_TOKEN`. This app never uses the v3 API key.

---

## Auth flow

1. User enters email at `/login`.
2. The server action calls `signInWithOtp({ email, emailRedirectTo })` and
   redirects to `/verify-request`.
3. The emailed link lands on `/auth/callback?code=...&next=/dashboard`.
4. The route handler calls `exchangeCodeForSession(code)` and redirects to
   `/dashboard` (or whatever `next=` requested, validated to start with `/`).

Session cookies are kept in sync by `middleware.ts`, which calls
`@supabase/ssr`'s `updateSession` on every request following the official
Next.js App Router pattern. Middleware also redirects unauthenticated users
away from `/dashboard` and `/admin`.

Onboarding is **not** blocking. If a new user has no `profiles.username`, the
dashboard shows a banner + inline form to set one. Username is optional until
they want to appear on the leaderboard.

---

## Admin authorization

There are two kinds of admin, both of which work through the app:

- **Email-only admins** — any email listed in `ADMIN_EMAILS`. Their
  `profiles.role` stays `'user'`; they are recognized by `requireAdmin()` and
  operate through the service-role app path.
- **DB-role admins** — users present in the `public.admin_users` table.

`profiles.role` is **deprecated for authorization** as of v10 (migration 012)
and must not be read for access decisions — it is left in place only because
dropping columns is out of scope.

### Why the JWT hook

Admin status used to be `profiles.role`, but `profiles` is a client-writable,
API-facing table: a row-level RLS policy let any user `PATCH` their own row to
`role: 'admin'` and satisfy every admin check (v10 A1). Migration 011 closes
that with column-level privileges (users may update only `username`), and
migration 012 removes `profiles.role` from the authorization path entirely:

- `admin_users` holds DB-role admins. RLS is enabled with **no policies** and
  no anon/authenticated grants, so it is unreachable from the client API.
- A **custom access token hook** (`public.custom_access_token`) stamps
  `app_role: 'admin'` into the JWT at issuance for users in `admin_users`.
- `public.is_admin()` reads that unforgeable claim; the ten admin RLS policies
  and the `settle_movie` in-function check all use it.

### Enabling the hook (required — a migration does not enable it)

Migration `012` **defines** the hook function but Supabase only calls it once
it is registered:

- **Hosted:** Dashboard → **Authentication → Hooks** → **Custom Access Token**
  → select `public.custom_access_token` and enable.
- **Local dev (`supabase/config.toml`):**

  ```toml
  [auth.hook.custom_access_token]
  enabled = true
  uri = "pg-functions://postgres/public/custom_access_token"
  ```

The claim is written at token issuance, so a user promoted while signed in
picks up `app_role` on their next token refresh / re-login.

### Promoting a user to admin (no self-serve path by design)

There is no in-app promotion. An operator inserts the user id into
`admin_users` with the service role (SQL Editor or a service-role script):

```sql
-- Find the user id from auth.users (by email), then:
insert into public.admin_users (user_id)
select id from auth.users where email = 'newadmin@example.com'
on conflict (user_id) do nothing;
```

The user must obtain a fresh token (sign out/in or refresh) for `is_admin()`
and the admin RLS policies to see the claim. To revoke, delete the row.

### The admin console

Visit `/admin` signed in as either admin type. The page is one route with
three tabs:

1. **Movies** — search by title, override `imdb_id` / `release_date` /
   `prediction_locks_at` / `status`, mark canceled. Writes use the
   service-role client (after `requireAdmin()` passes) so email-only admins,
   and DB-role admins whose token hasn't refreshed yet, can still operate.
2. **Sync** — POSTs to `/api/admin/tmdb-sync`, which pulls 3 pages of
   `/movie/upcoming` and upserts each movie with details, credits (director +
   top-5 cast), and the first YouTube trailer. Admin overrides are preserved
   on re-sync.
3. **Settlements** — lists movies in `awaiting_review`, `released_waiting_window`,
   or `settled`. Enter IMDb rating, vote count (optional), snapshot date, and
   release date used, then Finalize. The server action validates with Zod and
   calls the `settle_movie` RPC. An already-settled movie exposes a
   **Recompute missing score events** button as the fallback retry path.
   Manual settlement works for any movie regardless of snapshot state — it is
   the override path over cron auto-settlement.

### Manual settlement workflow

1. A movie reaches `awaiting_review` (cron does this automatically on day 28).
2. Admin opens IMDb and reads the current rating and vote count.
3. Admin opens `/admin` → Settlements tab, finds the movie, enters:
   - **Official rating** (e.g. 7.4) — must be 1.0–10.0
   - **Official num votes** (optional, informational only)
   - **Settlement snapshot date** — the date the IMDb snapshot was taken;
     must be on/after `release date used + 28` (DB constraint)
   - **Release date used** — pre-filled from the movie
   - **Notes** (optional)
4. Click **Finalize settlement**. The RPC runs atomically:
   - returns the existing settlement id if one already exists (idempotent)
   - inserts `settlements`
   - flips `movies.status = 'settled'`
   - inserts one `score_events` row per prediction
5. Leaderboards and dashboards update on next page load.

If a settlement completes but some `score_events` appear missing (e.g. you
added rows to `predictions` after settlement via a manual SQL path), click
**Recompute missing score events** on the same form.

---

## Cron

Vercel Cron hits `/api/cron/check-movie-lifecycle` daily at 03:00 UTC per
`vercel.json`.

It runs three phases (all idempotent; it never changes prediction locks):

1. **Status transitions** (date-driven):
   - `upcoming → released_waiting_window` when `release_date <= today`
   - `released_waiting_window → awaiting_review` when
     `release_date <= today − 28`
2. **Snapshot phase**: for every movie in `released_waiting_window` or
   `awaiting_review`, fetch the current TMDb rating (`/movie/{tmdb_id}`) and
   insert today's row into `rating_snapshots` (`on conflict do nothing`).
   Movies with a TMDb rating of 0 or fewer than 50 votes are skipped and
   counted in `snapshotSkipped`. TMDb calls are capped at 100 per run
   (`tmdbCalls` in the response).
3. **Auto-settle phase**: for every `awaiting_review` movie, find the
   earliest `rating_snapshots` row with `snapshot_date >= release_date + 28`
   and settle from it (`settle_movie` via the service client,
   `source_type = 'api_import'`, `source_snapshot = 'tmdb:<snapshot_date>'`).
   Movies without an eligible snapshot yet are counted in
   `awaitingSnapshot`. The migration-007 constraints are the backstop; this
   query is the primary guard.

The old auto-settle from the deprecated `movies.tmdb_*_snapshot` columns was
removed (it could settle with pre-release garbage data), and the
`autoSettled` / `autoSkipped` response fields are gone with it. Those columns
are no longer written — superseded by `rating_snapshots`.

**Snapshot source note:** v1 snapshots come from TMDb as a stated proxy for
IMDb. `settlements.source_type` / `source_snapshot` record this. Manual
settlement remains the override path for any movie regardless of snapshot
state.

### Auth

Bearer token via the `CRON_SECRET` env var:

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  https://your-domain.vercel.app/api/cron/check-movie-lifecycle
```

Missing or wrong token returns **401**.

### Smoke test against local dev

```bash
curl -H "Authorization: Bearer $CRON_SECRET" \
  http://localhost:3000/api/cron/check-movie-lifecycle

# → {"ok":true,"result":{"upcomingToWaiting":0,"waitingToAwaiting":0,"snapshotsInserted":0,"snapshotSkipped":0,"tmdbCalls":0,"settledFromSnapshot":0,"awaitingSnapshot":0,"errors":[]}}
```

### Admin TMDb sync endpoint

```bash
curl -X POST https://your-domain.vercel.app/api/admin/tmdb-sync \
  --cookie "$(copy session cookies from your browser)"
```

Authorization is via the user's Supabase session — the handler calls
`isAdmin()` and returns **403** otherwise.

---

## Community consensus

Once predictions for a movie are locked (derived state `locked`, or status
past `upcoming`), the movie detail page shows the community's predictions in
aggregate: median, prediction count, a 0.5-wide-bucket histogram, and — if
the viewer predicted — "You predicted 7.9 — above the community median of
7.4."

Raw predictions stay own-read (they're attributable). Aggregates are exposed
only through two `security definer` RPCs from migration 009:

- `get_prediction_consensus(p_movie_id)` → `(bucket numeric, count int)` rows
- `get_prediction_stats(p_movie_id)` → `(prediction_count, median, mean)`

**Both privacy gates live inside the SQL functions, not the UI** — the RPCs
are exposed via PostgREST to anonymous callers, so a React-only check would
be bypassable by calling `/rest/v1/rpc/...` directly:

1. **Lock gate** — while a movie is still open for predictions
   (`status = 'upcoming'` and lock time unset/in the future) the call is
   invalid and raises errcode `42501`.
2. **Minimum-sample gate** — with fewer than 3 predictions
   (`MIN_CONSENSUS_PREDICTIONS` in `lib/predictions/consensus.ts`, mirrored
   from the SQL constant in migration 009) the call is valid but returns
   **zero rows**: no partial stats, no count. The raise-vs-empty distinction
   is deliberate: the UI renders nothing on empty without try/catch, and an
   empty response leaks only "fewer than 3 predictions exist".

Consensus is only safe to expose because predictions are immutable after
lock. Any future *pre-lock* aggregate feature would reopen a
histogram-differencing attack and must not reuse these functions (see the
comment in `supabase/migrations/009_consensus_read.sql`).

---

## Tests

```bash
npm test           # unit tests always; integration tests if env configured
npm run test:watch # vitest watch mode
```

### Unit tests (always run)

- `tests/unit/scoring.test.ts` — `calcPoints`, `calcPointsWithBonus`, including
  the +10 bonus boundary and the zero floor.
- `tests/unit/eligibility.test.ts` — `checkEligibility` and
  `daysUntilSettlement`, including the day-27/28 boundaries.
- `tests/unit/utils.test.ts` — `toLocalDatetimeInputValue` round-trip under a
  fixed timezone offset.
- `tests/unit/leaderboard.test.ts` — page-merge helper (`collectPages`) and
  the pure ranking aggregation.
- `tests/unit/leaderboard-fetch.test.ts` — `fetchLeaderboard` returns a
  distinct error result on failure vs. an empty result on no data (B1).
- `tests/unit/range-since.test.ts` — UTC-explicit weekly/monthly cutoffs (B4).
- `tests/unit/consensus.test.ts` — bucket/median math and the comparison
  text, mirroring the SQL aggregates.

### Integration tests (skip without live DB)

Located in `tests/integration/*.test.ts`. They self-skip unless both
`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set; tests
that exercise anonymous or user-session access additionally need
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. To run them locally, make sure your
`.env.local` is loaded:

```bash
set -a; source .env.local; set +a
npm test
```

Coverage:

- `predictions.test.ts` — insert succeeds on an open movie, unique-constraint
  blocks a duplicate, upsert updates the value, out-of-range values rejected,
  lock state is derived from `prediction_locks_at` rather than status;
  deletes fail closed for locked and nonexistent movies.
- `settlement.test.ts` — calling `settle_movie` settles the movie and writes
  one score event per prediction with correct points; a repeat call is a
  no-op; a non-admin user-session RPC call is rejected (42501) with nothing
  written; snapshot-before-eligibility and out-of-range ratings hit the DB
  constraints; `eligible_from_date` equals `release_date_used + 28`; settling
  works with and without a vote count.
- `authz.test.ts` — the raw PostgREST attack path: self-service role
  escalation on `profiles` is blocked (role stays `'user'`, username update
  still works); a non-admin gets `42501` from `settle_movie` and is denied
  movie/settlement writes; `admin_users` promotion wiring (v10 A1).
- `leaderboard.test.ts` — an anon client sees all users' score events, and
  the leaderboard aggregation ranks them correctly.
- `consensus.test.ts` — the consensus RPCs called directly with an anon
  client: raise on an open movie, zero rows below 3 predictions, correct
  median/buckets at 3.
- `snapshots.test.ts` — auto-settle picks the day-29 snapshot over day-27,
  leaves a day-20-only movie unsettled, is idempotent, the snapshot phase
  skips low-quality data, and a rating-0.0 snapshot insert is rejected by the
  DB constraint (B2).

All files create and tear down their own users + movies via the service-role
client. They never touch seed data.

---

## Deployment (Vercel)

1. `git push` the repo to GitHub / GitLab / Bitbucket.
2. Import the repo in Vercel.
3. Set the six env vars in **Project → Settings → Environment Variables**
   (Production + Preview + Development).
4. Add your production URL — e.g. `https://premdb.example.com/auth/callback`
   — to Supabase **Authentication → URL Configuration → Redirect URLs**.
5. Deploy. `vercel.json` registers the daily cron automatically.

---

## Settlement implementation choice

Settlement is implemented as a Postgres RPC (`settle_movie`), originally in
`supabase/migrations/002_settlement_rpc.sql` and last re-defined in
`008_votes_optional.sql`. It is:

- **Atomic** — the insert into `settlements`, status update on `movies`, and
  insert into `score_events` all run inside a single function call (and
  therefore a single transaction).
- **Idempotent** — if a settlement row already exists for the movie, the
  function returns the existing id without writing anything. An
  `on conflict (user_id, movie_id) do nothing` clause on the score_events
  insert is belt-and-suspenders.
- **Security definer with an in-function authorization check** (migration
  005, moved to the `is_admin()` JWT claim in migration 012) — PostgREST
  exposes every public function, so the RPC itself rejects callers that are
  neither admins (`public.is_admin()`, i.e. the `app_role` JWT claim) nor the
  service role, with errcode `42501`. EXECUTE is revoked from `anon` and
  `PUBLIC`.
- **Guarded** (migration 007) — rating must be 1.0–10.0, the snapshot date
  must be on/after eligibility, and `eligible_from_date` is computed inside
  the function from `release_date_used + 28`.

The app path (`settleMovieAction` → `requireAdmin()` →
`lib/settlement/service.ts`) calls the RPC with the **service-role client**:
`requireAdmin()` accepts both email-only admins (`ADMIN_EMAILS`) and DB-role
admins (`admin_users`), and either could lack the `app_role` claim on the
current request (an email-only admin never has it; a DB-role admin whose token
hasn't refreshed doesn't yet), so they would fail the in-function check via a
user-session client. The in-function check protects the direct PostgREST door;
the app door is protected by `requireAdmin()`.

A fallback server-code path exists in `lib/settlement/service.ts`
(`recomputeScoreEvents`) for admin re-drive if needed.

---

## Migration map (live function definitions)

Several SQL functions are restated across migrations (forward-only means we
`CREATE OR REPLACE` in a new file rather than edit an old one). Only the
**live** definition below is authoritative — earlier copies are dead and must
not be edited:

| Function | Live definition | Superseded copies |
|---|---|---|
| `settle_movie` | **012** | 002, 004, 005, 007, 008 |
| `is_admin` | **012** | — |
| `custom_access_token` | **012** | — |
| `get_prediction_consensus` | **009** | — |
| `get_prediction_stats` | **009** | — |
| `prediction_consensus_count` | **009** | — |
| `handle_new_user` | **001** | — |

When changing one of these, edit only the migration named under "Live
definition" by adding a **new** migration that `CREATE OR REPLACE`s it, and
update this table.

---

## Future roadmap

Not in the current build, but kept in mind when drawing schema lines:

- True IMDb ingestion — `rating_snapshots` already keys on
  `(movie_id, source, snapshot_date)` with `source in ('tmdb', 'imdb')`, so
  an IMDb feed can land beside the TMDb proxy without schema changes.
- Settlement email notifications — explicitly deferred from v9; no email
  provider, email code, or `RESEND_API_KEY` exists in this build and nothing
  may depend on it yet.
- Seasons / rounds — would add a `seasons` table and `movies.season_id`.
  Leaderboard would filter on season; current weekly/monthly tiles remain as
  sub-filters.
- Private leagues — add `leagues`, `league_members`, and scope leaderboard
  queries by league. `score_events` is already flat enough to aggregate
  multiple ways.
- Derived scoring — if you later drop `score_events`, the scoring formula
  lives in one place (`lib/scoring/` + the RPC) so it's safe to recompute
  from `predictions` + `settlements` on read.

---

## Commands reference

```bash
# install
npm install

# dev
npm run dev

# type-check
npm run typecheck

# build / prod
npm run build
npm run start

# tests
npm test
npm run test:watch

# lint
npm run lint

# regenerate Supabase types (requires `supabase` CLI + local stack)
npm run db:types

# wipe app data in Supabase (movies, predictions, settlements, score events, profiles)
npm run db:reset:data
```

### Quick test reset

Use this to start fresh without touching migrations/schema:

```bash
set -a; source .env.local; set +a
npm run db:reset:data
```

Keep users' `profiles` (useful when testing repeatedly with the same accounts):

```bash
set -a; source .env.local; set +a
node scripts/reset-app-data.mjs --yes --keep-profiles
```
