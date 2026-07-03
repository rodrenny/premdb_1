-- C1: community consensus reveal (post-lock).
--
-- Raw predictions stay own-read (they're attributable); the community view
-- is exposed only through aggregate RPCs. Both privacy gates live INSIDE the
-- SQL functions, not the UI: PostgREST exposes these functions to anonymous
-- callers at /rest/v1/rpc/..., so any check done only in the React layer
-- would be bypassable by calling the endpoint directly.
--
--   1. Lock gate: while a movie is still open for predictions the call is
--      invalid — raise (errcode 42501).
--   2. Minimum-sample gate: with fewer than `min_predictions` predictions the
--      call is valid but returns ZERO rows — no partial stats, no count. The
--      raise-vs-empty distinction is deliberate: the UI renders nothing on an
--      empty result without try/catch, and an empty response leaks only
--      "fewer than 3 predictions exist", which is acceptable.
--
-- Frozen-data invariant: exposing these aggregates is only safe because
-- predictions are immutable after lock (the fail-closed delete in
-- lib/predictions/service.ts included). Any future PRE-lock aggregate
-- feature would reopen a histogram-differencing attack (diff bucket counts
-- as new predictions arrive to recover individual values) and must NOT
-- reuse these functions.

-- Shared gate. The sample threshold is defined once here — mirrored as
-- MIN_CONSENSUS_PREDICTIONS in lib/predictions/consensus.ts; keep in sync.
-- Returns the prediction count, or NULL when below the sample threshold
-- (callers then return zero rows). Internal only: EXECUTE is revoked from
-- the API roles below; the two public RPCs call it as definer.
create or replace function public.prediction_consensus_count(p_movie_id uuid)
returns int
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  -- Minimum sample size before any aggregate is revealed.
  min_predictions constant int := 3;
  v_movie public.movies%rowtype;
  v_count int;
begin
  select * into v_movie from public.movies where id = p_movie_id;
  if not found then
    raise exception 'Movie not found: %', p_movie_id using errcode = 'P0002';
  end if;

  -- Lock gate: pre-lock visibility would let players anchor on consensus.
  if v_movie.status = 'upcoming'
     and (v_movie.prediction_locks_at is null
          or v_movie.prediction_locks_at > now()) then
    raise exception 'consensus is not available before predictions lock'
      using errcode = '42501';
  end if;

  select count(*)::int into v_count
  from public.predictions
  where movie_id = p_movie_id;

  if v_count < min_predictions then
    return null;
  end if;
  return v_count;
end;
$$;

-- Histogram of predictions in 0.5-wide buckets (1.0, 1.5, ... 10.0).
create or replace function public.get_prediction_consensus(p_movie_id uuid)
returns table (bucket numeric, count int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  v_count := public.prediction_consensus_count(p_movie_id);
  if v_count is null then
    return; -- below sample threshold: zero rows
  end if;

  return query
    select
      round((floor(pr.predicted_value * 2) / 2)::numeric, 1),
      count(*)::int
    from public.predictions pr
    where pr.movie_id = p_movie_id
    group by 1
    order by 1;
end;
$$;

-- Companion summary stats.
create or replace function public.get_prediction_stats(p_movie_id uuid)
returns table (prediction_count int, median numeric, mean numeric)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_count int;
begin
  v_count := public.prediction_consensus_count(p_movie_id);
  if v_count is null then
    return; -- below sample threshold: zero rows
  end if;

  return query
    select
      v_count,
      round(
        (percentile_cont(0.5) within group (order by pr.predicted_value))::numeric,
        2
      ),
      round(avg(pr.predicted_value)::numeric, 2)
    from public.predictions pr
    where pr.movie_id = p_movie_id;
end;
$$;

-- Grants: the two RPCs are public (the gates above are the protection);
-- the internal gate helper is not directly callable by API roles.
revoke execute on function public.prediction_consensus_count(uuid) from public;
revoke execute on function public.prediction_consensus_count(uuid) from anon;
revoke execute on function public.prediction_consensus_count(uuid) from authenticated;

revoke execute on function public.get_prediction_consensus(uuid) from public;
grant execute on function public.get_prediction_consensus(uuid)
  to anon, authenticated, service_role;

revoke execute on function public.get_prediction_stats(uuid) from public;
grant execute on function public.get_prediction_stats(uuid)
  to anon, authenticated, service_role;
