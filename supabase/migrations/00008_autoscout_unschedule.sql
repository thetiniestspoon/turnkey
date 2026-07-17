-- WS3 cutover: the nightly work now runs on the local subscription-native harness
-- (scripts/agents/run-nightly.ts, schtasks 02:30). Unschedule the metered
-- autoscout pg_cron trigger so no gateway-billed autoscout runs happen.
--
-- NOTE: 00007 is intentionally reserved for the WS3 Phase-3 simulation layer
-- (investment_policies / simulated_investments / decision_log / backtests),
-- which lands after this cutover. This file is numbered 00008 per the plan.
--
-- Like 00004, this is DOCUMENTATION of a change applied via the SQL Editor
-- against the live project (xebulbfhwyezjrqobzow). Run it there:
--   https://supabase.com/dashboard/project/xebulbfhwyezjrqobzow/sql/new
--
-- KEEP weekly-digest (free) and agent-enricher scheduled/deployed. KEEP all edge
-- functions deployed as the manual fallback path (use-agent.ts buttons).

SELECT cron.unschedule('autoscout-daily');

-- Verify it is gone (should return zero rows for 'autoscout-daily'):
--   SELECT jobname FROM cron.job WHERE jobname = 'autoscout-daily';
