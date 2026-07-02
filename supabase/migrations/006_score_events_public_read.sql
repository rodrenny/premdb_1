-- A2: the leaderboard reads score_events with the caller's own session, but
-- the only SELECT policy was own-read (auth.uid() = user_id). Every non-admin
-- therefore saw a leaderboard containing only themselves, and anonymous
-- visitors saw an empty one.
--
-- Leaderboard data is public by design (points, movie, username), so open
-- SELECT to everyone. All admin write policies stay unchanged.

drop policy if exists "score_events own read" on public.score_events;

create policy "score_events public read"
  on public.score_events for select
  using (true);
