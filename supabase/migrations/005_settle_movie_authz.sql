-- A1: settle_movie is exposed by PostgREST at /rest/v1/rpc/settle_movie to
-- every authenticated user. It runs SECURITY DEFINER, so without an internal
-- authorization check any signed-in user could settle any movie with an
-- arbitrary rating and award themselves points. The requireAdmin() gate in
-- lib/admin/actions.ts only protects the app's server-action door — not the
-- direct PostgREST door.
--
-- This migration re-creates the function (same signature, same body) with an
-- authorization block at the top, before any write, and revokes EXECUTE from
-- anon. The grant to authenticated stays: the admin server action calls the
-- RPC and now relies on this in-function check (or bypasses it via the
-- service role — see lib/settlement/service.ts).

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
  -- Authorization: allow only admins or the service role.
  -- auth.uid() is NULL for service-role calls (no JWT user), so service-role
  -- callers (cron) pass via the role-claim branch below.
  if auth.uid() is not null then
    if coalesce(
         (select role from public.profiles where id = auth.uid()),
         'user'
       ) <> 'admin' then
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

-- Postgres grants EXECUTE on new functions to PUBLIC by default, so revoking
-- from anon alone would be ineffective — anon would keep EXECUTE via PUBLIC.
-- Revoke both, then grant back to the roles that may call it.
revoke execute on function public.settle_movie(
  uuid, numeric, int, date, date, date, text, text, text
) from public;

revoke execute on function public.settle_movie(
  uuid, numeric, int, date, date, date, text, text, text
) from anon;

grant execute on function public.settle_movie(
  uuid, numeric, int, date, date, date, text, text, text
) to authenticated, service_role;
