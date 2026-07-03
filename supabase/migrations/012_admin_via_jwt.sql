-- v10 A1(2): move admin status out of the client-writable profiles table and
-- into an unforgeable JWT claim.
--
-- Even with the column privileges from migration 011, profiles.role still
-- sits in an API-facing table one policy edit away from re-exposure. This
-- migration adopts Supabase's custom access token hook: admin status is
-- stamped into the JWT at issuance from a table clients cannot reach, and
-- every authorization check reads the claim instead of profiles.role.
--
-- Supersedes: the profiles.role subselect in the admin policies of
-- migration 001, and the in-function admin check in settle_movie
-- (migrations 005 / 007 / 008 — 008 holds the previous live definition).
--
-- IMPORTANT: the migration only DEFINES the hook. It must also be ENABLED in
-- the Supabase dashboard (Authentication → Hooks → Custom Access Token) or in
-- supabase/config.toml for local dev — a migration alone does not enable it.
-- See the README "Admin authorization" section.

-- admin_users: the source of truth for DB-role admins. RLS enabled with NO
-- policies and no grants to anon/authenticated, so it is entirely unreachable
-- from the client API. Only the service role (bypasses RLS) and the
-- security-definer hook (runs as owner) touch it.
create table public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

revoke all on table public.admin_users from public, anon, authenticated;
grant all on table public.admin_users to service_role;

-- Custom access token hook. Adds app_role: 'admin' to the token claims when
-- the user is in admin_users, and strips a stale app_role otherwise. Runs as
-- the hook role (supabase_auth_admin); security definer + owner-read of
-- admin_users keeps that table free of any policy.
create or replace function public.custom_access_token(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  claims jsonb;
  is_admin_user boolean;
begin
  select exists (
    select 1 from public.admin_users
    where user_id = (event ->> 'user_id')::uuid
  ) into is_admin_user;

  claims := coalesce(event -> 'claims', '{}'::jsonb);

  if is_admin_user then
    claims := jsonb_set(claims, '{app_role}', '"admin"');
  else
    claims := claims - 'app_role';
  end if;

  return jsonb_set(event, '{claims}', claims);
end;
$$;

-- Only the auth admin role may run the hook.
revoke execute on function public.custom_access_token(jsonb)
  from public, anon, authenticated;
do $$
begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    execute 'grant execute on function public.custom_access_token(jsonb) to supabase_auth_admin';
    -- The hook is security definer (owner-read), so it needs no direct grant
    -- on admin_users; usage on the schema is enough to resolve the function.
    execute 'grant usage on schema public to supabase_auth_admin';
  end if;
end $$;

-- is_admin(): the single authorization predicate. Reads the unforgeable JWT
-- claim rather than any table. Returns false for the service role (no JWT
-- user), which is intended — service-role paths are authorized before they
-- ever reach a policy.
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((auth.jwt() ->> 'app_role') = 'admin', false);
$$;

revoke execute on function public.is_admin() from public;
grant execute on function public.is_admin() to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Migrate every admin policy off the profiles.role subselect to is_admin().
-- Postgres has no CREATE OR REPLACE POLICY, so drop + recreate.
-- ---------------------------------------------------------------------------

drop policy if exists "movies admin insert" on public.movies;
create policy "movies admin insert"
  on public.movies for insert
  with check (public.is_admin());

drop policy if exists "movies admin update" on public.movies;
create policy "movies admin update"
  on public.movies for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "movies admin delete" on public.movies;
create policy "movies admin delete"
  on public.movies for delete
  using (public.is_admin());

drop policy if exists "predictions admin read" on public.predictions;
create policy "predictions admin read"
  on public.predictions for select
  using (public.is_admin());

drop policy if exists "settlements admin insert" on public.settlements;
create policy "settlements admin insert"
  on public.settlements for insert
  with check (public.is_admin());

drop policy if exists "settlements admin update" on public.settlements;
create policy "settlements admin update"
  on public.settlements for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "settlements admin delete" on public.settlements;
create policy "settlements admin delete"
  on public.settlements for delete
  using (public.is_admin());

drop policy if exists "score_events admin insert" on public.score_events;
create policy "score_events admin insert"
  on public.score_events for insert
  with check (public.is_admin());

drop policy if exists "score_events admin update" on public.score_events;
create policy "score_events admin update"
  on public.score_events for update
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "score_events admin delete" on public.score_events;
create policy "score_events admin delete"
  on public.score_events for delete
  using (public.is_admin());

-- ---------------------------------------------------------------------------
-- settle_movie: swap the profiles.role subselect for is_admin(). Everything
-- else (service-role branch, date guards, scoring, idempotency) is unchanged
-- from the migration-008 definition.
--
-- LIVE DEFINITION as of migration 012. Earlier definitions in migrations
-- 002, 004, 005, 007, 008 are SUPERSEDED — do not edit them.
-- ---------------------------------------------------------------------------
create or replace function public.settle_movie(
  p_movie_id uuid,
  p_official_rating numeric,
  p_official_num_votes int default null,
  p_settlement_snapshot_date date default null,
  p_release_date_used date default null,
  p_settlement_notes text default null,
  p_source_type text default 'manual',
  p_source_snapshot text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_movie public.movies%rowtype;
  v_settlement_id uuid;
  v_existing_settlement uuid;
  v_title text;
  v_eligible_from_date date;
begin
  -- Authorization: allow only admins (unforgeable JWT claim) or the service
  -- role. auth.uid() is NULL for service-role calls (no JWT user), so
  -- service-role callers (cron) pass via the role-claim branch below.
  if auth.uid() is not null then
    if not public.is_admin() then
      raise exception 'settle_movie: admin role required'
        using errcode = '42501';
    end if;
  end if;
  if auth.uid() is null
     and coalesce(current_setting('request.jwt.claims', true), '') <> ''
     and coalesce(
           nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
           ''
         ) <> 'service_role' then
    -- JWT present but neither a user (no uid) nor the service role (e.g. the
    -- bare anon key): reject. Service-role requests DO carry a JWT through
    -- PostgREST ({"role":"service_role"}, no sub), so the check must inspect
    -- the role claim rather than reject every uid-less JWT — otherwise the
    -- cron and admin settlement paths (service client) would be locked out.
    raise exception 'settle_movie: admin role required' using errcode = '42501';
  end if;

  -- Dates are required in practice; defaults exist only because plpgsql
  -- requires all parameters after the first defaulted one to have defaults.
  if p_settlement_snapshot_date is null or p_release_date_used is null then
    raise exception 'settle_movie: snapshot date and release date are required'
      using errcode = '22004';
  end if;

  select * into v_movie from public.movies where id = p_movie_id for update;
  if not found then
    raise exception 'Movie not found: %', p_movie_id using errcode = 'P0002';
  end if;

  select id into v_existing_settlement
  from public.settlements
  where movie_id = p_movie_id;

  if v_existing_settlement is not null then
    return v_existing_settlement;
  end if;

  v_title := v_movie.title;

  -- Settlement contract: eligible at release + 28 days. The 28 here must stay
  -- in sync with SETTLEMENT_WINDOW_DAYS in lib/settlement/eligibility.ts
  -- (the source of truth on the app side).
  v_eligible_from_date := p_release_date_used + 28;

  insert into public.settlements (
    movie_id,
    official_rating,
    official_num_votes,
    settlement_snapshot_date,
    release_date_used,
    eligible_from_date,
    settlement_rule_version,
    source_type,
    source_snapshot,
    settlement_notes
  ) values (
    p_movie_id,
    p_official_rating,
    p_official_num_votes,
    p_settlement_snapshot_date,
    p_release_date_used,
    v_eligible_from_date,
    'v1',
    p_source_type,
    p_source_snapshot,
    p_settlement_notes
  )
  returning id into v_settlement_id;

  update public.movies
  set status = 'settled', updated_at = now()
  where id = p_movie_id;

  insert into public.score_events (
    user_id,
    movie_id,
    points,
    prediction_value,
    official_value,
    movie_title_snapshot,
    settlement_snapshot_date
  )
  select
    pr.user_id,
    pr.movie_id,
    (
      greatest(0, round(100 - abs(pr.predicted_value - p_official_rating) * 20))
      + case
          when round(pr.predicted_value * 10) = round(p_official_rating * 10) then 10
          else 0
        end
    )::int,
    pr.predicted_value,
    p_official_rating,
    v_title,
    p_settlement_snapshot_date
  from public.predictions pr
  where pr.movie_id = p_movie_id
  on conflict (user_id, movie_id) do nothing;

  return v_settlement_id;
end;
$$;

-- Grants unchanged from migration 007/008: no PUBLIC/anon execute.
revoke execute on function public.settle_movie(
  uuid, numeric, int, date, date, text, text, text
) from public;
revoke execute on function public.settle_movie(
  uuid, numeric, int, date, date, text, text, text
) from anon;
grant execute on function public.settle_movie(
  uuid, numeric, int, date, date, text, text, text
) to authenticated, service_role;
