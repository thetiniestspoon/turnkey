-- ⚠️  IMPORTANT: This migration contains placeholder values.
-- Before applying, replace SERVICE_ROLE_KEY_HERE with your actual
-- Supabase service role key. Find it at:
--   Supabase Dashboard → Settings → API → service_role key
--
-- In production (xebulbfhwyezjrqobzow), the cron jobs were configured
-- manually via SQL Editor with the real key. This migration file is
-- kept as documentation of the schedule configuration.

-- Enable required extensions (must be enabled in Supabase Dashboard first)
-- Dashboard → Database → Extensions → enable pg_cron and pg_net

-- NOTE: These cron jobs call Edge Functions via pg_net.
-- Replace SERVICE_ROLE_KEY_HERE with your actual service role key,
-- or run these via Supabase SQL Editor after enabling the extensions.

-- Autoscout: runs daily at 6 AM ET (11 AM UTC)
-- Only scouts watchlists assigned to today's day-of-week
SELECT cron.schedule(
  'autoscout-daily',
  '0 11 * * *',
  $$SELECT net.http_post(
    url := 'https://xebulbfhwyezjrqobzow.supabase.co/functions/v1/agent-autoscout',
    headers := '{"Authorization": "Bearer SERVICE_ROLE_KEY_HERE", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )$$
);

-- Weekly digest: runs every Monday at 8 AM ET (1 PM UTC)
SELECT cron.schedule(
  'weekly-digest',
  '0 13 * * 1',
  $$SELECT net.http_post(
    url := 'https://xebulbfhwyezjrqobzow.supabase.co/functions/v1/agent-digest',
    headers := '{"Authorization": "Bearer SERVICE_ROLE_KEY_HERE", "Content-Type": "application/json"}'::jsonb,
    body := '{}'::jsonb
  )$$
);
