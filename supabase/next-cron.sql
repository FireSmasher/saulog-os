-- Saulog OS next, phase 6: run push-daily every 15 minutes. Run AFTER next-setup.sql and
-- after deploying push-daily. Safe to run again (it replaces the job).
-- The filled-in copy with the real secret is next/.secrets/cron.sql on the Mac (never in
-- git). This template has a placeholder: PASTE_CRON_SECRET.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule(jobid) from cron.job where jobname = 'saulog-push-daily';
select cron.schedule(
  'saulog-push-daily',
  '*/15 * * * *',
  $$
  select net.http_post(
    url := 'https://dmyelqbeifdirjpqvhsl.supabase.co/functions/v1/push-daily',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', 'PASTE_CRON_SECRET'),
    body := '{}'::jsonb
  );
  $$
);
