# Security rotation debt

## Service-role key baked into live pg_cron rows

The production Supabase project `xebulbfhwyezjrqobzow` runs two pg_cron jobs
(`autoscout-daily`, `weekly-digest`) whose `command` text embeds the
**service-role key** inline as a `Bearer` token in the `net.http_post` call
(configured manually in the SQL Editor — `supabase/migrations/00004_pg_cron_schedules.sql`
is documentation only, with a `SERVICE_ROLE_KEY_HERE` placeholder).

**Consequence:** rotating the service-role key requires updating those cron
`command` bodies (via `cron.alter_job` / re-`cron.schedule`) **in addition to**
the `.env` used by the nightly harness and any Supabase Function secrets.
A rotation that misses the cron rows silently breaks `weekly-digest`
(and, until cutover, `autoscout-daily`).

**On rotation, update all of:**
1. `.env` → `SUPABASE_SERVICE_ROLE_KEY` (nightly harness).
2. pg_cron job commands for `weekly-digest` (and `autoscout-daily` if still scheduled)
   in the SQL Editor: https://supabase.com/dashboard/project/xebulbfhwyezjrqobzow/sql/new
3. Any Supabase Function secrets that reference it.

**After WS3 cutover** `autoscout-daily` is unscheduled (migration 00008), so only
`weekly-digest` retains a baked key — but it still must be rotated with the rest.

_This is tracked debt, not a Phase 0 action: the key is not rotated here, only recorded._
