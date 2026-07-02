# PreMDB

Predict the eventual IMDb rating of unreleased movies, and score points when
they settle.

This is the **tightened v8** MVP build (balanced, operator-safe). See
`PreMDB_tightened_v8_prompt.md` for the full product spec.

---

## Overview

- Users browse upcoming unreleased movies and predict their future IMDb rating
  to one decimal place.
- When a movie settles (at least 28 days past release), points are awarded and
  the leaderboard updates.
- Admins can still settle manually, but cron can auto-settle day-28+ movies
  when TMDb snapshot data is present.

---

## Product rules

- One prediction per user per movie (unique DB constraint).
- Predictions allowed only while `prediction_locks_at > now()`. "Locked" is
  derived from time — it is **not** a persisted movie status.
- A movie becomes settlement-eligible once **28 days** have passed since the
  chosen release date.
- The official result is the first daily IMDb snapshot on or after day 28.
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
lib/
  supabase/             server, client, middleware helpers (@supabase/ssr)
  auth/                 admin.ts + server actions
  validations/          all Zod schemas
  scoring/              pure scoring math (unit tested)
  settlement/           pure eligibility + settlement service
  leaderboard/          server-side aggregation
  movies/               display-state derivation + TMDb URL helpers
  predictions/          server actions
  tmdb/                 client + sync
  admin/                server actions
supabase/
  migrations/
    001_initial.sql     schema + RLS + profile auto-create trigger
    002_settlement_rpc.sql   atomic settle_movie(...)
  seed.sql              sample movies + settlement
tests/
  unit/                 scoring + eligibility (no DB)
  integration/          predictions + settlement (live DB, self-skip)
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
# apply supabase/migrations/001_initial.sql and 002_settlement_rpc.sql
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
   and paste:
   - `supabase/migrations/001_initial.sql`
   - `supabase/migrations/002_settlement_rpc.sql`
5. (Optional) paste `supabase/seed.sql` for sample movies.

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

## Admin

Visit `/admin` signed in as a user whose email is in `ADMIN_EMAILS` (or whose
`profiles.role = 'admin'`). The page is one route with three tabs:

1. **Movies** — search by title, override `imdb_id` / `release_date` /
   `prediction_locks_at` / `status`, mark canceled. Writes use the
   service-role client (after `requireAdmin()` passes) so email-only admins
   who haven't had their `profiles.role` promoted can still operate.
2. **Sync** — POSTs to `/api/admin/tmdb-sync`, which pulls 3 pages of
   `/movie/upcoming` and upserts each movie with details, credits (director +
   top-5 cast), and the first YouTube trailer. Admin overrides are preserved
   on re-sync.
3. **Settlements** — lists movies in `awaiting_review`, `released_waiting_window`,
   or `settled`. Enter IMDb rating, vote count, snapshot date, and release
   date used, then Finalize. The server action validates with Zod and calls
   the `settle_movie` RPC. An already-settled movie exposes a **Recompute
   missing score events** button as the fallback retry path.

### Manual settlement workflow

1. A movie reaches `awaiting_review` (cron does this automatically on day 28).
2. Admin opens IMDb and reads the current rating and vote count.
3. Admin opens `/admin` → Settlements tab, finds the movie, enters:
   - **Official rating** (e.g. 7.4)
  - **Official num votes**
   - **Settlement snapshot date** — the date the IMDb snapshot was taken
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

It does date-driven transitions and optional auto-settlement:

- `upcoming → released_waiting_window` when `release_date <= today`
- `released_waiting_window → awaiting_review` when `release_date <= today − 28`
- `awaiting_review → settled` when day-28+ and TMDb snapshot data exists
  (`tmdb_rating_snapshot`, `tmdb_num_votes_snapshot`, `tmdb_snapshot_date`)

It never changes prediction locks. All transitions are idempotent.

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

# → {"ok":true,"result":{"upcomingToWaiting":0,"waitingToAwaiting":0,"autoSettled":0,"autoSkipped":0,"errors":[]}}
```

### Admin TMDb sync endpoint

```bash
curl -X POST https://your-domain.vercel.app/api/admin/tmdb-sync \
  --cookie "$(copy session cookies from your browser)"
```

Authorization is via the user's Supabase session — the handler calls
`isAdmin()` and returns **403** otherwise.

---

## Tests

```bash
npm test           # unit tests always; integration tests if env configured
npm run test:watch # vitest watch mode
```

### Unit tests (always run)

- `tests/unit/scoring.test.ts` — `calcPoints`, `calcPointsWithBonus`, including
  the +10 bonus boundary and the zero floor.
- `tests/unit/eligibility.test.ts` — `checkEligibility`, including the day-28
  boundary.

### Integration tests (skip without live DB)

Located in `tests/integration/*.test.ts`. They self-skip unless both
`NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are set. To run
them locally, make sure your `.env.local` is loaded:

```bash
set -a; source .env.local; set +a
npm test
```

Coverage:

- `predictions.test.ts` — insert succeeds on an open movie, unique-constraint
  blocks a duplicate, upsert updates the value, out-of-range values rejected,
  lock state is derived from `prediction_locks_at` rather than status.
- `settlement.test.ts` — calling `settle_movie` settles the movie and writes
  one score event per prediction with correct points; a repeat call is a
  no-op (no duplicate rows, settlement row not updated); aggregated totals
  match the scoring formula.

Both files create and tear down their own users + movies via the service-role
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

Settlement is implemented as a Postgres RPC (`settle_movie`) in
`supabase/migrations/002_settlement_rpc.sql`, per the spec's preferred path.
It is:

- **Atomic** — the insert into `settlements`, status update on `movies`, and
  insert into `score_events` all run inside a single function call (and
  therefore a single transaction).
- **Idempotent** — if a settlement row already exists for the movie, the
  function returns the existing id without writing anything. An
  `on conflict (user_id, movie_id) do nothing` clause on the score_events
  insert is belt-and-suspenders.
- **Security definer** — so the RPC can bypass RLS on the inner writes. The
  `settleMovieAction` in `lib/admin/actions.ts` gates access with
  `requireAdmin()` before calling.

A fallback server-code path exists in `lib/settlement/service.ts`
(`recomputeScoreEvents`) for admin re-drive if needed.

---

## Future roadmap

Not in the v1 MVP, but kept in mind when drawing schema lines:

- Automated IMDb ingestion (vote counts + rating) — would populate a new
  `imdb_snapshots` table keyed by `(movie_id, snapshot_date)`. `settlements`
  already has `source_type` to distinguish `manual` from `api_import`.
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
