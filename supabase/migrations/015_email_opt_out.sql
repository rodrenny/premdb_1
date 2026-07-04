-- C2: settlement email opt-out.
--
-- One boolean on profiles: false (default) means the user receives the
-- settlement email; true means they have turned it off. Emails are sent by
-- server code with the service role, which reads this column freely — the
-- column exists so users control the preference themselves.

alter table public.profiles
  add column email_opt_out boolean not null default false;

-- Migration 011 replaced the table-level UPDATE grant with a column-level
-- grant on (username, updated_at). Column grants are additive, so granting
-- the new column extends the surface without disturbing 011; the full
-- intended list is re-stated here so this file documents it in one place:
-- authenticated users may update exactly (username, updated_at,
-- email_opt_out) on their own row. RLS row policies are unchanged.
grant update (username, updated_at, email_opt_out)
  on table public.profiles to authenticated;
