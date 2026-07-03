-- v10 follow-up: remove a stale settle_movie overload left behind in some
-- hosted databases.
--
-- The live definition is the 8-argument function from migration 012:
--   (uuid, numeric, int, date, date, text, text, text)
--
-- A legacy 6-argument overload can make PostgREST return PGRST203 ("could not
-- choose the best candidate function") whenever callers omit optional
-- parameters. Drop it explicitly so there is only one RPC endpoint shape.
drop function if exists public.settle_movie(
  uuid, numeric, int, date, date, text
);

select pg_notify('pgrst', 'reload schema');
