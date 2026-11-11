-- Apoy smart reminders (W7): the server side of the nudge Edge Function.
-- Run AFTER supabase/next-setup.sql and supabase/social-setup.sql, and after deploying the
-- nudge function. Safe to run again: every step checks or replaces what it makes.
--
-- This file has TWO placeholders and must never hold the real values (the repo is public):
--   PASTE_CRON_SECRET  the CRON_SECRET from next/.secrets/push.env
--   PASTE_PROJECT_REF  the project ref, the part before .supabase.co in next/src/lib/supabase.ts
-- Make the filled-in copy on the Mac (next/.secrets/ is git-ignored), then paste THAT copy
-- into the SQL editor:
--   cd next
--   set -a; . ./.secrets/push.env; set +a
--   REF=$(sed -n 's#.*https://\([a-z0-9]*\)\.supabase\.co.*#\1#p' src/lib/supabase.ts | head -1)
--   sed -e "s/PASTE_CRON_SECRET/$CRON_SECRET/" -e "s/PASTE_PROJECT_REF/$REF/" ../supabase/nudge-setup.sql > .secrets/nudge-cron.sql
--   pbcopy < .secrets/nudge-cron.sql

-- 1. Which friend a "friend" push was about (one push per friend per day).
alter table public.notification_events
  add column if not exists friend_id uuid references auth.users(id) on delete set null;

-- 2. The service worker reports a tap. Only the caller's own event, only the first tap.
create or replace function public.mark_push_opened(event_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update public.notification_events
     set opened_at = now()
   where id = mark_push_opened.event_id
     and user_id = auth.uid()
     and opened_at is null;
$$;

revoke all on function public.mark_push_opened(uuid) from public, anon;
grant execute on function public.mark_push_opened(uuid) to authenticated;

-- 3. Cron: stop the old push-daily job (if it was ever scheduled), run nudge every 15 min.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname in ('saulog-push-daily', 'apoy-nudge');
select cron.schedule(
  'apoy-nudge',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://PASTE_PROJECT_REF.supabase.co/functions/v1/nudge',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'PASTE_CRON_SECRET'),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
  $$
);
