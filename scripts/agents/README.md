# Turnkey nightly agent harness

Subscription-native nightly agentic real-estate pipeline (scout → analyst →
market-check → tracker). Runs entirely on cred-free `claude -p` subprocesses
(covered by the Claude Code subscription — **$0 gateway spend**) instead of
the metered Vercel AI Gateway that the deployed edge functions use. Writes to
the exact same Supabase tables the existing UI reads, with **zero UI
changes**.

The 11 Supabase edge functions (`agent-scout`, `agent-analyst`,
`agent-market-check`, `agent-tracker`, `agent-enricher`, `agent-advisor`,
`agent-autoscout`, `agent-orchestrator`, `agent-digest`, …) stay deployed as a
manual/fallback path the UI's buttons can still invoke. Only the metered
`autoscout-daily` pg_cron trigger is unscheduled at Phase-2 cutover.

## How to run

```
npm run agents:nightly
```

is equivalent to:

```
npx tsx scripts/agents/run-nightly.ts
```

Flags:

- `--dry-run` — runs the full pipeline shape with no LLM calls and no DB
  writes. Useful for a quick sanity check that env/args wiring is correct.
- `--stage=scout` — run only the scout stage (Phase 1). Phase 2 adds
  `analyst`, `market-check`, and `tracker` stage values at the seam marked
  in `run-nightly.ts`.
- `--watchlist=<id>` — restrict the scout stage to a single watchlist id
  (instead of the capped set of active watchlists).

With no flags, the harness runs every wired stage against the capped set of
active watchlists/properties for the night.

## Kill switch

Set `TURNKEY_AUTONOMY_OFF` to any non-empty value in `.env` to disable **all**
autonomous nightly runs without unregistering the scheduled task. The harness
logs and exits 0 immediately — no stage runs, no writes.

## Quiet-night semantics

If a `claude -p` call reports a subscription/usage rate limit mid-run, the
harness logs "quiet night", records that stage's `agent_runs` row as
`status: 'timeout'`, stops processing further stages/watchlists, and exits
**0**. This is deliberate: a non-zero exit here would make Windows Task
Scheduler treat it as a failure and potentially retry-storm. A quiet night is
expected, recoverable behavior, not an error.

## Caps (nightly)

Constants in `run-nightly.ts` (`CAPS`):

- `watchlists: 3` — at most 3 active watchlists scouted per night.
- `analyst: 10` — at most 10 analyst calls per night (Phase 2).
- `marks: 15` — at most 15 market-check marks per night (Phase 2).

## `.env` requirement

The harness holds the Supabase **service-role** key and performs all DB
writes itself; no secret ever reaches the `claude -p` subprocess (data goes
in via the prompt, JSON comes out on stdout). Required in the gitignored
`.env` at repo root:

```
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
```

Get the service-role key at:
https://supabase.com/dashboard/project/xebulbfhwyezjrqobzow/settings/api

If the key is missing or placeholder-shaped, `assertServiceRoleKey` throws an
error naming that dashboard link — never a raw stack trace, never silently
proceeding with a bad key. See `.env.example` for the full list of vars
(including the enricher hygiene keys consolidated there).

## Scheduling (Windows `schtasks`)

Register (run against the **main checkout path**, not this worktree, once
merged — the `.bat` `cd`s to its own repo root via `%~dp0..\..`):

```
schtasks /Create /TN "TurnkeyNightly" /TR "\"<repo-root>\scripts\agents\run-nightly.bat\"" /SC DAILY /ST 02:30 /F
```

Force one unattended run to verify registration:

```
schtasks /Run /TN "TurnkeyNightly"
```

Delete:

```
schtasks /Delete /TN "TurnkeyNightly" /F
```

Logs are appended to `scripts/agents/nightly.log` (gitignored via the repo's
`*.log` rule — `.ingest-logs/` does not exist in this repo, so the `.bat`
redirects here instead).

## Security

See `docs/SECURITY-ROTATION.md` for the service-role-key rotation debt (the
key is also baked into two live pg_cron job commands in the Supabase SQL
Editor, independent of this harness's `.env`).

## Source & visibility

The nightly harness writes scouted properties with `source='autoscout'` —
matching what the already-deployed `agent-autoscout` edge function writes
today. This is the plan's **default resolution**, not yet confirmed by
Shawn (see Task 1.9 in the implementation plan,
`docs/superpowers/plans/2026-07-17-turnkey-nightly-agents.md`).

What this means concretely:

- The **Scout page**'s saved list (`/scout`, `useProperties({source:
  'agent_scout'})`) filters on `source='agent_scout'` and is **not** the
  visibility path for nightly rows — nightly rows will not appear there.
- Phase-1 scout output is visible via the **map view** and other property
  views that don't filter on `source`.
- After Phase 2 (analyst → market-check → recommendation gating), properties
  that clear the recommendation bar (`market_status='active'` and latest
  `confidence_score >= 50`) surface on the **dashboard's RecommendedDeals**
  (`user_recommendations`), which also does not filter by `source`.

No file under `src/` is modified to reconcile this — per the plan's
zero-UI-change constraint, this is a documentation-only resolution. If Shawn
wants nightly rows to appear in the Scout page's saved list specifically,
the fix is either a UI change (out of scope for Phases 0–2) or switching the
harness to write `source='agent_scout'` instead — that decision is his to
make, not silently chosen here.
