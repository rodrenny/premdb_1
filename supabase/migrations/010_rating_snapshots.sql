-- C3: daily rating snapshots. Makes the displayed settlement rule literally
-- true: "This movie settles at the first daily snapshot taken on or after 28
-- days post-release." The cron takes one snapshot per movie per day while a
-- movie is in released_waiting_window / awaiting_review, and auto-settlement
-- picks the earliest snapshot with snapshot_date >= release_date + 28.
--
-- v1 snapshots come from TMDb as a stated proxy for IMDb;
-- settlements.source_type / source_snapshot record the provenance.
--
-- The old movies.tmdb_rating_snapshot / tmdb_num_votes_snapshot /
-- tmdb_snapshot_date columns are deprecated, superseded by rating_snapshots.
-- They are no longer written; dropping columns is out of scope.

create table public.rating_snapshots (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references public.movies(id) on delete cascade,
  source text not null default 'tmdb' check (source in ('tmdb', 'imdb')),
  rating numeric(3,1) not null,
  num_votes int,
  snapshot_date date not null,
  created_at timestamptz not null default now(),
  unique (movie_id, source, snapshot_date)
);

create index rating_snapshots_movie_date_idx
  on public.rating_snapshots(movie_id, snapshot_date);

-- RLS: public read; NO client write policies at all — snapshots are written
-- exclusively by the cron via the service role, which bypasses RLS.
alter table public.rating_snapshots enable row level security;

create policy "rating_snapshots public read"
  on public.rating_snapshots for select
  using (true);
