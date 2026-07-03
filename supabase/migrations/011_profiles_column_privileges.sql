-- v10 A1(1): close self-service role escalation on public.profiles.
--
-- Problem: the "profiles own update" RLS policy is row-level (it restricts
-- WHICH row a user may update), not column-level. PostgREST honors column
-- updates within an allowed row, so any authenticated user could
--   PATCH /rest/v1/profiles?id=eq.<their-id> { "role": "admin" }
-- and instantly satisfy every admin RLS policy and the settle_movie role
-- check that key on profiles.role.
--
-- Column-level privileges compose with RLS (a write must satisfy BOTH the
-- column privilege and the row policy), so restricting the updatable columns
-- closes the hole without touching any existing policy. The service role
-- bypasses all of this.
--
-- Profile rows are created exclusively by the SECURITY DEFINER trigger
-- public.handle_new_user() (migration 001), which runs as the function owner
-- and bypasses these grants — so clients never legitimately INSERT into
-- profiles at all, and INSERT is revoked entirely (no column grant needed).
-- All client profile writes go through updateUsernameAction, which sets only
-- (username, updated_at).

-- UPDATE: users may change only their own username (the row policy still
-- enforces "own row"). role / id / created_at become non-updatable by the
-- anon and authenticated API roles.
revoke update on table public.profiles from anon, authenticated;
grant update (username, updated_at) on table public.profiles to authenticated;

-- INSERT: created by the definer trigger, never by clients. Revoke entirely.
revoke insert on table public.profiles from anon, authenticated;
