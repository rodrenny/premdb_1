-- v10 B2: enforce the rating range on rating_snapshots at the DB level.
--
-- The 1.0 floor and 50-vote minimum currently live only in runSnapshotPhase
-- (lib/settlement/auto.ts). The table itself accepts any numeric(3,1). The
-- rating range is a correctness invariant (a settlement sourced from a
-- snapshot must be a real 1.0-10.0 rating — see settlements_rating_range in
-- migration 007), so it belongs in the schema regardless of the writing path.
--
-- NOT VALID for forward-only safety (consistent with migration 007): fully
-- enforces all new writes without validating any pre-existing rows.
--
-- The 50-vote minimum stays in app code — it is a data-quality threshold,
-- not a correctness invariant.

alter table public.rating_snapshots
  add constraint rating_snapshots_rating_range
  check (rating >= 1.0 and rating <= 10.0)
  not valid;
