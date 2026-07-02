-- Contract change: settle eligibility is day-28, no vote threshold, no expired status.
--
-- This migration updates only the status constraint. Runtime behavior is
-- enforced in app logic (cron + validation).

update public.movies
set status = 'awaiting_review'
where status = 'expired';

alter table public.movies
  drop constraint if exists movies_status_check;

alter table public.movies
  add constraint movies_status_check
  check (status in (
    'upcoming',
    'released_waiting_window',
    'awaiting_review',
    'settled',
    'canceled'
  ));
