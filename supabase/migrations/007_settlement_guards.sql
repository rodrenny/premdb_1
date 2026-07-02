-- A3: guard settlement against pre-release garbage data.
--
-- The old cron auto-settle path could settle a movie at rating 0.0 from a
-- TMDb snapshot taken weeks before release. Three layers of defence are
-- added; this migration provides two of them (the third is removing the
-- broken cron path in app code):
--
--   1. DB constraints: official_rating must be a real 1.0–10.0 rating, and
--      the settlement snapshot must not predate the eligibility date.
--   2. eligible_from_date is computed inside the RPC from
--      p_release_date_used + 28 instead of trusting the caller, so the
--      p_eligible_from_date parameter is dropped.

alter table public.settlements
  add constraint settlements_rating_range
  check (official_rating >= 1.0 and official_rating <= 10.0);

alter table public.settlements
  add constraint settlements_snapshot_after_eligible
  check (settlement_snapshot_date >= eligible_from_date);

-- The parameter list changes, so the old signature must be dropped explicitly
-- (CREATE OR REPLACE cannot remove a parameter).
drop function if exists public.settle_movie(
  uuid, numeric, int, date, date, date, text, text, text
);

create or replace function public.settle_movie(
  p_movie_id uuid,
  p_official_rating numeric,
  p_official_num_votes int,
  p_settlement_snapshot_date date,
  p_release_date_used date,
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
  -- Authorization: allow only admins or the service role.
  -- auth.uid() is NULL for service-role calls (no JWT user), so service-role
  -- callers (cron) pass via the coalesce branch.
  if auth.uid() is not null then
    if coalesce(
         (select role from public.profiles where id = auth.uid()),
         'user'
       ) <> 'admin' then
      raise exception 'settle_movie: admin role required'
        using errcode = '42501';
    end if;
  end if;
  if auth.uid() is null and current_setting('request.jwt.claims', true) is not null
     and coalesce(current_setting('request.jwt.claims', true), '') <> '' then
    -- JWT present but no uid (e.g. anon key): reject.
    raise exception 'settle_movie: admin role required' using errcode = '42501';
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

-- Same grant posture as migration 005: no PUBLIC/anon execute, in-function
-- check guards authenticated callers.
revoke execute on function public.settle_movie(
  uuid, numeric, int, date, date, text, text, text
) from public;

revoke execute on function public.settle_movie(
  uuid, numeric, int, date, date, text, text, text
) from anon;

grant execute on function public.settle_movie(
  uuid, numeric, int, date, date, text, text, text
) to authenticated, service_role;
