create extension if not exists "uuid-ossp";

-- drop in reverse dependency order so re-runs start clean ---------------
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

drop table if exists public.score_events cascade;
drop table if exists public.settlements cascade;
drop table if exists public.predictions cascade;
drop table if exists public.movies cascade;
drop table if exists public.profiles cascade;

-- profiles ---------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  role text not null default 'user' check (role in ('user', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- movies -----------------------------------------------------------------
create table public.movies (
  id uuid primary key default uuid_generate_v4(),
  tmdb_id int unique not null,
  imdb_id text,
  title text not null,
  original_title text,
  overview text,
  poster_path text,
  backdrop_path text,
  release_date date,
  release_date_source text default 'tmdb',
  prediction_locks_at timestamptz,
  runtime int,
  tmdb_rating_snapshot numeric(3,1),
  tmdb_num_votes_snapshot int,
  tmdb_snapshot_date date,
  genres jsonb not null default '[]',
  director_name text,
  cast_preview jsonb not null default '[]',
  trailer_youtube_key text,
  status text not null default 'upcoming'
    check (status in (
      'upcoming',
      'released_waiting_window',
      'awaiting_review',
      'settled',
      'canceled'
    )),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index movies_status_idx on public.movies(status);
create index movies_release_date_idx on public.movies(release_date);

-- predictions ------------------------------------------------------------
create table public.predictions (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  movie_id uuid not null references public.movies(id) on delete cascade,
  predicted_value numeric(3,1) not null check (predicted_value between 1.0 and 10.0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, movie_id)
);

create index predictions_user_id_idx on public.predictions(user_id);
create index predictions_movie_id_idx on public.predictions(movie_id);

-- settlements ------------------------------------------------------------
create table public.settlements (
  id uuid primary key default uuid_generate_v4(),
  movie_id uuid unique not null references public.movies(id) on delete cascade,
  official_rating numeric(3,1) not null,
  official_num_votes int not null,
  settlement_snapshot_date date not null,
  settled_at timestamptz not null default now(),
  release_date_used date not null,
  eligible_from_date date not null,
  settlement_rule_version text not null default 'v1',
  source_type text not null default 'manual'
    check (source_type in ('manual', 'dataset', 'api_import')),
  source_snapshot text,
  settlement_notes text
);

-- score_events -----------------------------------------------------------
create table public.score_events (
  id uuid primary key default uuid_generate_v4(),
  user_id uuid not null references auth.users(id) on delete cascade,
  movie_id uuid not null references public.movies(id) on delete cascade,
  points int not null,
  prediction_value numeric(3,1) not null,
  official_value numeric(3,1) not null,
  movie_title_snapshot text,
  settlement_snapshot_date date,
  created_at timestamptz not null default now(),
  unique(user_id, movie_id)
);

create index score_events_user_id_idx on public.score_events(user_id);
create index score_events_created_at_idx on public.score_events(created_at);

-- RLS --------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.movies enable row level security;
alter table public.predictions enable row level security;
alter table public.settlements enable row level security;
alter table public.score_events enable row level security;

-- profiles policies
create policy "profiles public read"
  on public.profiles for select
  using (true);

create policy "profiles own insert"
  on public.profiles for insert
  with check (auth.uid() = id);

create policy "profiles own update"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

-- movies policies
create policy "movies public read"
  on public.movies for select
  using (true);

create policy "movies admin insert"
  on public.movies for insert
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

create policy "movies admin update"
  on public.movies for update
  using ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

create policy "movies admin delete"
  on public.movies for delete
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

-- predictions policies
create policy "predictions own read"
  on public.predictions for select
  using (auth.uid() = user_id);

create policy "predictions own insert"
  on public.predictions for insert
  with check (auth.uid() = user_id);

create policy "predictions own update"
  on public.predictions for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "predictions own delete"
  on public.predictions for delete
  using (auth.uid() = user_id);

create policy "predictions admin read"
  on public.predictions for select
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

-- settlements policies
create policy "settlements public read"
  on public.settlements for select
  using (true);

create policy "settlements admin insert"
  on public.settlements for insert
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

create policy "settlements admin update"
  on public.settlements for update
  using ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

create policy "settlements admin delete"
  on public.settlements for delete
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

-- score_events policies
create policy "score_events own read"
  on public.score_events for select
  using (auth.uid() = user_id);

create policy "score_events admin insert"
  on public.score_events for insert
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

create policy "score_events admin update"
  on public.score_events for update
  using ((select role from public.profiles where id = auth.uid()) = 'admin')
  with check ((select role from public.profiles where id = auth.uid()) = 'admin');

create policy "score_events admin delete"
  on public.score_events for delete
  using ((select role from public.profiles where id = auth.uid()) = 'admin');

-- profiles auto-create trigger ------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id)
  values (new.id)
  on conflict do nothing;
  return new;
end;
$$;

create or replace trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();
