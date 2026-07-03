-- PreMDB seed data
--
-- Movies are safe to seed directly. Predictions and score_events reference
-- auth.users, so the bottom block is a template: create test users in the
-- Supabase dashboard (or `supabase auth signup` via CLI), grab their uuids,
-- then uncomment the inserts and paste the uuids in.

-- ---------------------------------------------------------------------------
-- Sample movies across all lifecycle states
-- ---------------------------------------------------------------------------

-- Open for predictions (far-future release)
insert into public.movies (
  tmdb_id, title, original_title, overview, poster_path, backdrop_path,
  release_date, prediction_locks_at, runtime, genres, director_name,
  cast_preview, trailer_youtube_key, status
) values
(
  900001,
  'The Long Night',
  'The Long Night',
  'A weary detective chases a ghost through the neon-drenched streets of a future city.',
  '/placeholder-poster-1.jpg',
  '/placeholder-backdrop-1.jpg',
  (current_date + interval '90 days')::date,
  (current_date + interval '89 days')::timestamptz,
  128,
  '[{"id":28,"name":"Action"},{"id":9648,"name":"Mystery"}]'::jsonb,
  'Ana Reyes',
  '[{"name":"Oscar Pine","character":"Cale"},{"name":"Ines Vega","character":"Mori"}]'::jsonb,
  'dQw4w9WgXcQ',
  'upcoming'
),
(
  900002,
  'Glass Harbor',
  'Glass Harbor',
  'Four siblings return to their childhood island and uncover a decades-old secret.',
  '/placeholder-poster-2.jpg',
  '/placeholder-backdrop-2.jpg',
  (current_date + interval '45 days')::date,
  (current_date + interval '44 days')::timestamptz,
  115,
  '[{"id":18,"name":"Drama"}]'::jsonb,
  'Henry Walsh',
  '[{"name":"Maya Chen","character":"Iris"},{"name":"Tomás Ruiz","character":"Felix"}]'::jsonb,
  'dQw4w9WgXcQ',
  'upcoming'
);

-- Upcoming but prediction lock has already passed (predictions closed)
insert into public.movies (
  tmdb_id, title, overview, poster_path, backdrop_path,
  release_date, prediction_locks_at, runtime, genres, director_name,
  cast_preview, status
) values
(
  900003,
  'Vanishing Point',
  'A rally driver races across the continent to deliver a message nobody wants heard.',
  '/placeholder-poster-3.jpg',
  '/placeholder-backdrop-3.jpg',
  (current_date + interval '7 days')::date,
  (current_date - interval '1 day')::timestamptz,
  104,
  '[{"id":28,"name":"Action"},{"id":53,"name":"Thriller"}]'::jsonb,
  'Dana Okafor',
  '[{"name":"Jude Park","character":"Kowalski"}]'::jsonb,
  'upcoming'
);

-- Released, inside the 14-day waiting window
insert into public.movies (
  tmdb_id, title, overview, poster_path, backdrop_path,
  release_date, prediction_locks_at, runtime, genres, director_name,
  cast_preview, status
) values
(
  900004,
  'Paper Kingdom',
  'An origami artist accidentally folds a rift between worlds.',
  '/placeholder-poster-4.jpg',
  '/placeholder-backdrop-4.jpg',
  (current_date - interval '5 days')::date,
  (current_date - interval '6 days')::timestamptz,
  97,
  '[{"id":16,"name":"Animation"},{"id":14,"name":"Fantasy"}]'::jsonb,
  'Rin Takeda',
  '[{"name":"Kai Sato","character":"Hiro (voice)"}]'::jsonb,
  'released_waiting_window'
);

-- Past day 28, waiting for admin settlement
insert into public.movies (
  tmdb_id, title, overview, poster_path, backdrop_path,
  release_date, prediction_locks_at, runtime, genres, director_name,
  cast_preview, status
) values
(
  900005,
  'Signal Lost',
  'A remote arctic research team realizes they are the only ones left listening.',
  '/placeholder-poster-5.jpg',
  '/placeholder-backdrop-5.jpg',
  (current_date - interval '20 days')::date,
  (current_date - interval '21 days')::timestamptz,
  121,
  '[{"id":878,"name":"Science Fiction"},{"id":27,"name":"Horror"}]'::jsonb,
  'Marcus Tyne',
  '[{"name":"Helena Brooks","character":"Dr. Vale"}]'::jsonb,
  'awaiting_review'
);

-- Settled
insert into public.movies (
  tmdb_id, imdb_id, title, overview, poster_path, backdrop_path,
  release_date, prediction_locks_at, runtime, genres, director_name,
  cast_preview, status
) values
(
  900006,
  'tt9000006',
  'After the Fire',
  'A family rebuilds on the land that took everything from them.',
  '/placeholder-poster-6.jpg',
  '/placeholder-backdrop-6.jpg',
  (current_date - interval '45 days')::date,
  (current_date - interval '46 days')::timestamptz,
  133,
  '[{"id":18,"name":"Drama"}]'::jsonb,
  'Priya Anand',
  '[{"name":"Adam Clarke","character":"Sam"},{"name":"Noor Hassan","character":"Lila"}]'::jsonb,
  'settled'
);

-- Settlement for the settled movie above
insert into public.settlements (
  movie_id,
  official_rating,
  official_num_votes,
  settlement_snapshot_date,
  release_date_used,
  eligible_from_date,
  settlement_rule_version,
  source_type,
  settlement_notes
)
select
  m.id,
  7.4,
  8213,
  -- Must be on/after eligible_from_date (release + 28 = 17 days ago) to
  -- satisfy the settlements_snapshot_after_eligible constraint (007).
  (current_date - interval '15 days')::date,
  m.release_date,
  (m.release_date + interval '28 days')::date,
  'v1',
  'manual',
  'Seed settlement.'
from public.movies m
where m.tmdb_id = 900006;

-- ---------------------------------------------------------------------------
-- Sample predictions and score_events (template)
-- ---------------------------------------------------------------------------
-- After creating a test user, replace <USER_UUID> with the user's uuid and
-- uncomment the block below.
--
-- insert into public.predictions (user_id, movie_id, predicted_value)
-- select '<USER_UUID>'::uuid, id, 7.0 from public.movies where tmdb_id = 900001;
--
-- insert into public.predictions (user_id, movie_id, predicted_value)
-- select '<USER_UUID>'::uuid, id, 6.8 from public.movies where tmdb_id = 900003;
--
-- insert into public.predictions (user_id, movie_id, predicted_value)
-- select '<USER_UUID>'::uuid, id, 7.5 from public.movies where tmdb_id = 900006;
--
-- insert into public.score_events (
--   user_id, movie_id, points, prediction_value, official_value,
--   movie_title_snapshot, settlement_snapshot_date
-- )
-- select
--   '<USER_UUID>'::uuid,
--   m.id,
--   98, -- |7.5 - 7.4| = 0.1 → 100 - 2 = 98
--   7.5,
--   7.4,
--   m.title,
--   (current_date - interval '31 days')::date
-- from public.movies m
-- where m.tmdb_id = 900006;
