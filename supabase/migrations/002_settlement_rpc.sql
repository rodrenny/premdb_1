-- Atomic, idempotent settlement for a movie.
--
-- Preferred settlement path (per spec). Does all of:
--   1. returns early if a settlement already exists for the movie
--   2. inserts into settlements
--   3. flips movies.status to 'settled'
--   4. writes one score_events row per existing prediction
--
-- All inside a single transaction (Postgres functions are transactional),
-- so partial failures can't leave orphaned rows. Uses `on conflict do nothing`
-- on score_events insert as defence in depth.
--
-- Scoring formula matches lib/scoring/index.ts:
--   base  = max(0, round(100 - |p - a| * 20))
--   bonus = 10 if round(p*10) = round(a*10) else 0

create or replace function public.settle_movie(
  p_movie_id uuid,
  p_official_rating numeric,
  p_official_num_votes int,
  p_settlement_snapshot_date date,
  p_release_date_used date,
  p_eligible_from_date date,
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
begin
  -- Lock the movie row for the duration of the transaction.
  select * into v_movie from public.movies where id = p_movie_id for update;
  if not found then
    raise exception 'Movie not found: %', p_movie_id using errcode = 'P0002';
  end if;

  -- Idempotency: if a settlement already exists, return its id unchanged.
  select id into v_existing_settlement
  from public.settlements
  where movie_id = p_movie_id;

  if v_existing_settlement is not null then
    return v_existing_settlement;
  end if;

  v_title := v_movie.title;

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
    p_eligible_from_date,
    'v1',
    p_source_type,
    p_source_snapshot,
    p_settlement_notes
  )
  returning id into v_settlement_id;

  update public.movies
  set status = 'settled', updated_at = now()
  where id = p_movie_id;

  -- Insert one score_events row per existing prediction.
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

-- Let authenticated users call it; the RLS policies on the underlying tables
-- still protect writes (the function runs as definer, so callers don't need
-- direct insert rights on settlements/score_events). Restrict to admins
-- inside the server action before calling.
grant execute on function public.settle_movie(
  uuid, numeric, int, date, date, date, text, text, text
) to authenticated;
