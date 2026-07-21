# Turnkey Subscription-Native Nightly Agents — WS3 Phases 0–2 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move Turnkey's nightly agentic real-estate pipeline (scout → analyst → market-check → tracker) off the metered Vercel AI Gateway onto a scheduled local Node/TypeScript harness that spawns cred-free `claude -p` subprocesses (subscription-covered), writing to the exact same Supabase tables the existing UI reads — so the dashboard/scout/predictions pages populate nightly with **zero UI changes and $0 gateway spend**.

**Architecture:** A deterministic `tsx` harness (`scripts/agents/run-nightly.ts`) holds the Supabase **service-role** key (from a gitignored `.env`) and performs **all** DB writes. Each LLM stage is a **cred-free** `claude -p` call — data goes in via the prompt on stdin, JSON comes out on stdout; no secret ever reaches Claude. Web-capable stages (scout, market-check) pass `--allowedTools "WebSearch,WebFetch"`; reasoning-only stages (analyst, tracker) pass no tools. Every stage validates its LLM output against the repo's existing `src/schemas/*` Zod contracts before writing. Enrichment (BLS/Census/FRED/HUD — LLM-free) is fetched by calling the still-deployed `agent-enricher` edge function over HTTP, so no data-fetch code is re-ported. The 11 edge functions stay deployed as a manual/fallback path; only the metered `autoscout-daily` pg_cron trigger is unscheduled at cutover.

**Tech Stack:** Node 22.14 + `tsx` (TypeScript execution, resolves `@/*` tsconfig paths), `@supabase/supabase-js` (service-role admin client), Zod v4 (`src/schemas/*`), `claude` CLI v2.1.x (`claude -p`), Windows `schtasks` (02:30 daily), Vitest (unit tests). Spawn pattern mirrors `command-center-runtime/cc-orchestration/loop/intention.mjs`.

## Global Constraints

- **House rules (verbatim):** worktree only; read any file before your first Edit/Write to it; secrets live in gitignored `.env`, never in chat/args/command-line; never push `master`; land via PR. Work happens in the worktree `C:\tmp\turnkey-nightly-agents` (branch `feat/turnkey-nightly-agents`).
- **Never expose secret values.** Do not `cat`/`Read`/echo `.env` or `API-KEY-SETUP.md` contents. Scripts that touch secrets read them file→file and emit only booleans/counts. `lib/db.ts` rejects missing/placeholder-shaped service-role keys with a Supabase dashboard link — never a raw stack trace.
- **Supabase project ref:** `xebulbfhwyezjrqobzow` (confirmed in `.mcp.json` + `migrations/00004`). Edge-function base URL: `https://xebulbfhwyezjrqobzow.supabase.co/functions/v1/`. Dashboard API-keys page: `https://supabase.com/dashboard/project/xebulbfhwyezjrqobzow/settings/api`. SQL Editor: `https://supabase.com/dashboard/project/xebulbfhwyezjrqobzow/sql/new`.
- **Every `agent_runs` row written by the harness** uses `cost_est: 0` and `model: 'claude-code-subscription'`. Allowed `agent_type` values (constraint, migration 00006): `scout, analyst, tracker, advisor, enricher, autoscout, orchestrator, market_check, digest`. `trigger` ∈ `cron|manual|auto`. `status` ∈ `running|success|error|timeout`. **Do not** add new `agent_type` values in Phases 0–2 (that is Phase 3).
- **Zero UI changes.** No file under `src/` may be modified. The UI reads these columns — preserve them exactly: `agent_runs(cost_est, agent_type, status, started_at, output_summary)`; `properties(source, raw_data, market_status, stale_at, …)`; `property_analyses(*)`; `property_predictions(metric, predicted_value, actual_value, accuracy_score, resolved_at)`; `user_recommendations(recommended, dismissed_at)`.
- **Naming mappings that must stay identical to the edge functions** (LLM field → DB column): `rental.monthly_rent` → `property_analyses.rental_monthly_est`; `overall_confidence` → `confidence_score`; `summary` → `analysis_summary`; merged enrichment blob → `neighborhood_data`. Predictions: metric `arv` = `flip.arv`, metric `rental_income` = `rental.monthly_rent`, metric `renovation_cost` = `flip.renovation_est`.
- **Run convention:** the harness is invoked `npx tsx scripts/agents/run-nightly.ts [flags]`. It calls `process.loadEnvFile()` at startup to load `.env` from repo root (Node 22.14 built-in; no dotenv dependency). Add `tsx` to `devDependencies` for offline/scheduled determinism.
- **Kill switch:** if env `TURNKEY_AUTONOMY_OFF` is set to any non-empty value, `run-nightly.ts` logs and exits 0 without running any stage.
- **Quiet-night semantics:** if a `claude -p` call reports a subscription/usage rate limit, the harness logs "quiet night", records the stage run as `status: 'timeout'`, stops further stages, and exits **0** (never a crash loop, never a non-zero exit that would make Task Scheduler retry-storm).
- **Nightly caps:** ≤3 watchlists scouted per night, ≤10 analyst calls per night, ≤15 market-check marks per night. Caps are constants in `run-nightly.ts`.

---

## Reference: exact source contracts (do not guess — these were read from source)

**Spawn pattern** (`cc-orchestration/loop/intention.mjs:131-154`): `spawnSync('claude', argv, { input: prompt, encoding: 'utf8', timeout: 120000, shell: true, maxBuffer: 1024*1024 })`; `extractJson` = substring from first `{` to last `}` then `JSON.parse`, returns `null` on failure; on no-JSON return a graceful fallback object rather than throwing.

**Edge-function LLM stages to REPLACE with `claude -p`** (all currently hit the metered gateway):
- `agent-scout/index.ts` — system prompt lines **9–25** (`SCOUT_SYSTEM_PROMPT`), user prompt lines **89–123**; web_search over `[zillow, redfin, realtor, homes, trulia, movoto, opendoor]`; writes `properties` upsert (onConflict `address,city,state`) + `agent_runs`.
- `agent-analyst/index.ts` — system prompt lines **6–51** (`ANALYST_SYSTEM_PROMPT`), user prompt lines **114–123**; no web; writes `property_analyses` + 3 `property_predictions` + `agent_runs`.
- `agent-market-check/index.ts` — system prompt lines **9–23** (`MARKET_CHECK_SYSTEM_PROMPT`), user prompt lines **58–60**; web_search max 2; writes `properties.market_status` + `property_status_history` + dismisses `user_recommendations` + `agent_runs`.
- `agent-tracker/index.ts` — system prompt lines **6–17** (`TRACKER_SYSTEM_PROMPT`), user prompt lines **53–58**; no web; short-circuits (no LLM) when zero resolved predictions; writes `property_predictions.accuracy_score/resolved_at` + `agent_runs`.

**Edge functions KEPT (deployed, unchanged, called or left as fallback):**
- `agent-enricher` — LLM-free external-data cache; harness calls it over HTTP for market context. Body `{ region, region_type, data_types, lat?, lng? }`, returns `{ results, fetched_at }`, writes `market_data`. Reads `CENSUS_API_KEY/FRED_API_KEY/HUD_API_TOKEN/BLS_API_KEY` from Supabase secrets (NOT from our `.env`).
- `agent-digest` (weekly-digest cron kept), `agent-advisor` (chat orb, stays metered — low volume), plus all others remain deployed as the manual fallback the UI's `use-agent.ts` buttons invoke.

**Orchestration logic to port into the harness** (from `agent-autoscout` + `agent-orchestrator`):
- Watchlist selection: `watchlists` where `active = true` (autoscout also filters `scout_day = today`; the nightly harness ignores `scout_day` and just takes up to the cap of active watchlists — documented deviation, see Task 1.7).
- Criteria filter (`passesFilter`, autoscout lines 41–87): drop scouted properties failing `max_price / min_cap_rate / min_flip_roi / min_score / property_types / strategies` from the user's merged `investment_criteria`.
- Per-property processing (orchestrator lines 5–92): skip if `raw_data.score < auto_analyze_min_score` (default 60); if no `property_analyses` row exists, run analyst; run market-check; if market status `active` AND latest `confidence_score >= 50`, upsert `user_recommendations {recommended:true, dismissed_at:null}`.
- Stale flagging (orchestrator lines 149–179): set `properties.stale_at = now()` for properties whose `pipeline` row is in `watching|analyzing` and `entered_stage_at < now()-30d` and `stale_at is null`; clear `stale_at = null` for properties whose pipeline advanced past `analyzing`.

---

## File Structure

```
scripts/agents/
  run-nightly.ts        # orchestrator CLI: loadEnvFile → kill-switch → gates → stages → summary. Flags: --dry-run, --stage=<name>, --watchlist=<id>
  run-nightly.bat       # schtasks wrapper (documents the 02:30 daily registration + kill-switch + delete cmd)
  README.md             # ops doc: what it does, how to run, kill switch, caps, rotation pointer
  lib/
    env.ts              # loadEnv() wrapper + assertServiceRoleKey() guard (rejects missing/placeholder)
    db.ts               # createAdminClient() (service-role) + typed write helpers per table
    claude.ts           # extractJson(), isRateLimited(), callClaude() spawn shell
    run-log.ts          # startRun()/finishRun() → agent_runs with cost_est:0, model constant
    enrich.ts           # enrichMarket() — HTTP POST to deployed agent-enricher
    scout.ts            # buildScoutPrompt(), parseScoutOutput(), mapScoutPropertyToRow(), runScout()
    analyst.ts          # (Phase 2) buildAnalystPrompt(), parseAnalystOutput(), mapAnalysisToRow(), mapPredictionRows(), runAnalyst()
    market-check.ts     # (Phase 2) buildMarketCheckPrompt(), parseMarketCheckOutput(), runMarketCheck()
    tracker.ts          # (Phase 2) buildTrackerPrompt(), parseTrackerOutput(), runTracker()
    orchestrate.ts      # (Phase 2) selectWatchlists(), passesFilter(), mergeCriteria(), processProperty(), flagStale()
  prompts/
    scout.md            # ported SCOUT_SYSTEM_PROMPT verbatim
    analyst.md          # (Phase 2) ported ANALYST_SYSTEM_PROMPT verbatim
    market-check.md     # (Phase 2) ported MARKET_CHECK_SYSTEM_PROMPT verbatim
    tracker.md          # (Phase 2) ported TRACKER_SYSTEM_PROMPT verbatim
docs/
  SECURITY-ROTATION.md  # (Phase 0) service-role-key-in-cron-rows rotation note
supabase/migrations/
  00008_autoscout_unschedule.sql   # (Phase 2) doc migration recording the cutover (00007 reserved for the Phase 3 simulation layer)
tests/agents/
  claude.test.ts        # extractJson, isRateLimited (pure)
  env.test.ts           # assertServiceRoleKey guard (pure)
  run-log.test.ts       # buildRunRow shape → cost_est:0, model constant (pure)
  scout.test.ts         # buildScoutPrompt, parseScoutOutput, mapScoutPropertyToRow (pure)
  run-nightly.test.ts   # parseArgs, kill-switch gate, cap logic (pure)
  analyst.test.ts       # (Phase 2) parse + mapping gotchas (pure)
  market-check.test.ts  # (Phase 2) parse + status transition → dismiss logic (pure)
  tracker.test.ts       # (Phase 2) parse + short-circuit (pure)
  orchestrate.test.ts   # (Phase 2) passesFilter, mergeCriteria, recommendation gate, stale logic (pure)
```

**Decomposition principle:** every stage lib is split into **pure functions** (prompt-building, JSON parse+Zod validate, LLM-field→DB-row mapping, filter/gate logic) which are unit-tested with TDD, plus a thin **I/O shell** (`runX()`) that wires enrich + `callClaude` + map + `db` write and is exercised by the manual integration verifications at each phase's end. TDD targets the pure functions; non-determinism (the LLM, the network, the DB) lives only in the shells.

---

# PHASE 0 — Hygiene (secrets → `.env`; rotation note)

**Exit criteria:** `.env.example` documents every key the harness/enricher needs; a committed, value-free operator script + walkthrough lets Shawn consolidate the real BLS/Census/FRED/HUD/Walkscore values into `.env` and add the service-role key; `docs/SECURITY-ROTATION.md` records the cron-row service-role-key rotation debt. No secret value ever enters the transcript, a command line, or git.

### Task 0.1: Update `.env.example` + add `tsx` devDependency

**Files:**
- Modify: `.env.example`
- Modify: `package.json` (devDependencies + a convenience script)

**Interfaces:**
- Produces: the canonical list of env var names the harness reads (`SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`) and the hygiene keys (`BLS_API_KEY`, `CENSUS_API_KEY`, `FRED_API_KEY`, `HUD_API_TOKEN`, `WALKSCORE_API_KEY`).

- [ ] **Step 1: Read the current files.** Read `.env.example` and `package.json` fully before editing.

- [ ] **Step 2: Rewrite `.env.example`** to this exact content (placeholders only — never real values):

```
# ── Frontend (Vite) ───────────────────────────────────────────────
VITE_SUPABASE_URL=your_supabase_url
VITE_SUPABASE_ANON_KEY=your_supabase_anon_key

# ── Nightly agent harness (scripts/agents/run-nightly.ts) ─────────
# The harness holds the service-role key and does ALL Supabase writes.
# Get the service-role key at:
#   https://supabase.com/dashboard/project/xebulbfhwyezjrqobzow/settings/api
SUPABASE_URL=your_supabase_url
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

# Set to any non-empty value to disable all autonomous nightly runs:
# TURNKEY_AUTONOMY_OFF=1

# ── Enricher API keys (hygiene: consolidated here out of API-KEY-SETUP.md) ──
# These are read by the DEPLOYED agent-enricher edge function from Supabase
# secrets, not by the harness. They live here so there is one local secret
# store. Free signups documented in (the now-scrubbed) API-KEY-SETUP.md.
BLS_API_KEY=your_bls_api_key
CENSUS_API_KEY=your_census_api_key
FRED_API_KEY=your_fred_api_key
HUD_API_TOKEN=your_hud_api_token
WALKSCORE_API_KEY=your_walkscore_api_key
```

- [ ] **Step 3: Add `tsx` to `package.json` devDependencies** and an `agents:nightly` script. Add `"tsx": "^4.19.0"` to `devDependencies` (keep alphabetical order among the `t*` entries) and add to `scripts`:

```json
"agents:nightly": "tsx scripts/agents/run-nightly.ts"
```

- [ ] **Step 4: Install and verify tsx resolves.**

Run: `cd /c/tmp/turnkey-nightly-agents && npm install && npx tsx --version`
Expected: prints a tsx/esbuild version, exit 0.

- [ ] **Step 5: Commit.**

```bash
git add .env.example package.json package-lock.json
git commit -m "chore(agents): document harness env vars + add tsx runner"
```

### Task 0.2: Value-free `.env` consolidation script + operator walkthrough

The move of real secret values is an **operator step** — the executor never reads the values. This task ships the tooling; the human runs it.

**Files:**
- Create: `scripts/agents/sync-env-from-setup.mjs`
- Create: `.planning/walkthroughs/2026-07-17-turnkey-env-hygiene.html` (operator handoff; if `.planning/walkthroughs/` does not exist, create it)

**Interfaces:**
- Produces: an idempotent file→file consolidator that appends any missing `KEY=value` lines from `API-KEY-SETUP.md` into `.env`, prints only `KEY: added|already-present|not-found` (never values), and reports whether `SUPABASE_SERVICE_ROLE_KEY` is present (boolean) with a dashboard link if absent.

- [ ] **Step 1: Write `scripts/agents/sync-env-from-setup.mjs`** with exactly this content:

```js
#!/usr/bin/env node
// Consolidate real API keys from the OneDrive-plaintext API-KEY-SETUP.md into
// the gitignored .env — file→file, so no value ever transits chat or a CLI arg.
// Idempotent: never overwrites an existing .env key; only appends missing ones.
// Prints ONLY booleans/status, never a secret value. Run:  node scripts/agents/sync-env-from-setup.mjs
import fs from 'node:fs';
import path from 'node:path';

const ROOT = path.resolve(import.meta.dirname, '..', '..');
const SETUP = path.join(ROOT, 'API-KEY-SETUP.md');
const ENV = path.join(ROOT, '.env');
const WANT = ['BLS_API_KEY', 'CENSUS_API_KEY', 'FRED_API_KEY', 'HUD_API_TOKEN', 'WALKSCORE_API_KEY'];
const DASH = 'https://supabase.com/dashboard/project/xebulbfhwyezjrqobzow/settings/api';

const placeholderish = (v) =>
  !v || v.length < 8 || /^your_/i.test(v) || /[<>]/.test(v) || /[^\x20-\x7e]/.test(v);

function parseEnv(text) {
  const map = new Map();
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/.exec(line);
    if (m) map.set(m[1], m[2]);
  }
  return map;
}

const setupText = fs.existsSync(SETUP) ? fs.readFileSync(SETUP, 'utf8') : '';
const envText = fs.existsSync(ENV) ? fs.readFileSync(ENV, 'utf8') : '';
const setup = parseEnv(setupText);
const env = parseEnv(envText);

let appended = '';
for (const key of WANT) {
  if (!env.has(key) || placeholderish(env.get(key))) {
    const val = setup.get(key);
    if (val && !placeholderish(val)) {
      appended += `${key}=${val}\n`;
      console.log(`${key}: added`);
    } else {
      console.log(`${key}: not-found (fill it in .env yourself; free signup in API-KEY-SETUP.md)`);
    }
  } else {
    console.log(`${key}: already-present`);
  }
}
if (appended) {
  const sep = envText.endsWith('\n') || envText === '' ? '' : '\n';
  fs.appendFileSync(ENV, `${sep}# Enricher API keys (consolidated from API-KEY-SETUP.md)\n${appended}`);
}

const srk = env.get('SUPABASE_SERVICE_ROLE_KEY');
if (!srk || placeholderish(srk)) {
  console.log(`\nSUPABASE_SERVICE_ROLE_KEY: MISSING — paste it into .env yourself, from:\n  ${DASH}`);
  process.exitCode = 2;
} else {
  console.log('\nSUPABASE_SERVICE_ROLE_KEY: present');
}
console.log('\nDone. Next: scrub the real values out of API-KEY-SETUP.md (replace with placeholders or delete the file — it is only a signup guide).');
```

- [ ] **Step 2: Verify the script runs without exposing values (dry check on placeholders).** Because real values live only on Shawn's machine, verify behavior against the current (placeholder) state:

Run: `cd /c/tmp/turnkey-nightly-agents && node scripts/agents/sync-env-from-setup.mjs; echo "exit=$?"`
Expected: prints `KEY: not-found` / `already-present` lines and `SUPABASE_SERVICE_ROLE_KEY: MISSING …` with the dashboard link, `exit=2`. **No secret value printed.** (Exit 2 here is correct — the worktree `.env` has no real service-role key.)

- [ ] **Step 3: Write the operator walkthrough** `.planning/walkthroughs/2026-07-17-turnkey-env-hygiene.html` — a self-contained HTML page (per house `feedback_html_walkthroughs.md`) with: (a) one fenced command `node scripts/agents/sync-env-from-setup.mjs` with a copy button; (b) a deep-link button to `https://supabase.com/dashboard/project/xebulbfhwyezjrqobzow/settings/api` labeled "Get service-role key"; (c) a checklist: run script → paste service-role key into `.env` in your editor → re-run script until it prints `present` → scrub real values from `API-KEY-SETUP.md`. Use the existing walkthrough idiom (inline CSS, no external assets). Keep it theme-aware and mobile-clean.

- [ ] **Step 4: Commit** (the script + walkthrough only — never `.env`).

```bash
git add scripts/agents/sync-env-from-setup.mjs ".planning/walkthroughs/2026-07-17-turnkey-env-hygiene.html"
git commit -m "chore(agents): value-free .env consolidation script + operator walkthrough"
```

- [ ] **Step 5: Operator handoff (human).** Surface the walkthrough to Shawn (SendUserFile render, or report its path if unavailable). This is the only way the real values move; do not attempt it yourself.

### Task 0.3: Service-role-key rotation note

**Files:**
- Create: `docs/SECURITY-ROTATION.md`

- [ ] **Step 1: Write `docs/SECURITY-ROTATION.md`** with exactly this content:

```markdown
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
```

- [ ] **Step 2: Commit.**

```bash
git add docs/SECURITY-ROTATION.md
git commit -m "docs: record service-role key baked into pg_cron rows (rotation debt)"
```

---

# PHASE 1 — Runner + scout

**Exit criteria:** `npx tsx scripts/agents/run-nightly.ts --dry-run` runs the full pipeline with no LLM calls and no writes; `--stage=scout` performs a real scout that lands `source='autoscout'` properties visible on the Scout page (`/scout`, `useProperties({source:'agent_scout'})` — see Task 1.8 note on source visibility); `run-nightly.bat` is registered with `schtasks` at 02:30 daily and one unattended run completes. Unit tests green.

### Task 1.1: `lib/env.ts` — env loading + service-role guard

**Files:**
- Create: `scripts/agents/lib/env.ts`
- Test: `tests/agents/env.test.ts`

**Interfaces:**
- Produces:
  - `loadEnv(): void` — calls `process.loadEnvFile()` if `.env` exists at repo root; no-op if already loaded/absent (swallows the "already loaded" / ENOENT errors).
  - `assertServiceRoleKey(env: NodeJS.ProcessEnv): { url: string; key: string }` — returns `{ url, key }` or throws an `Error` whose message names the dashboard link. Placeholder detection: key missing, `length < 20`, matches `/^your_/i`, contains `<`/`>`, or contains a non-ASCII byte.
  - `isPlaceholder(v: string | undefined): boolean` — exported for tests.

- [ ] **Step 1: Write the failing test** `tests/agents/env.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { isPlaceholder, assertServiceRoleKey } from '../../scripts/agents/lib/env'

describe('isPlaceholder', () => {
  it('flags empty, short, your_, angle-bracket, and non-ascii values', () => {
    expect(isPlaceholder(undefined)).toBe(true)
    expect(isPlaceholder('')).toBe(true)
    expect(isPlaceholder('short')).toBe(true)
    expect(isPlaceholder('your_service_role_key')).toBe(true)
    expect(isPlaceholder('sb_secret_<paste>')).toBe(true)
    expect(isPlaceholder('sb_secret_…aaaaaaaaaaaa')).toBe(true)
  })
  it('accepts a realistic-looking key', () => {
    expect(isPlaceholder('eyJhbGciOiJI' + 'a'.repeat(60))).toBe(false)
  })
})

describe('assertServiceRoleKey', () => {
  it('throws with the dashboard link when key is missing', () => {
    expect(() => assertServiceRoleKey({ SUPABASE_URL: 'https://x.supabase.co' } as NodeJS.ProcessEnv))
      .toThrow(/dashboard\/project\/xebulbfhwyezjrqobzow\/settings\/api/)
  })
  it('throws when url is missing', () => {
    expect(() => assertServiceRoleKey({ SUPABASE_SERVICE_ROLE_KEY: 'eyJ' + 'a'.repeat(60) } as NodeJS.ProcessEnv))
      .toThrow(/SUPABASE_URL/)
  })
  it('returns url+key when both valid', () => {
    const out = assertServiceRoleKey({
      SUPABASE_URL: 'https://xebulbfhwyezjrqobzow.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJI' + 'a'.repeat(60),
    } as NodeJS.ProcessEnv)
    expect(out.url).toContain('supabase.co')
    expect(out.key.length).toBeGreaterThan(20)
  })
})
```

- [ ] **Step 2: Run test to verify it fails.**
Run: `cd /c/tmp/turnkey-nightly-agents && npx vitest run tests/agents/env.test.ts`
Expected: FAIL — cannot resolve `../../scripts/agents/lib/env`.

- [ ] **Step 3: Write `scripts/agents/lib/env.ts`:**

```ts
const DASH = 'https://supabase.com/dashboard/project/xebulbfhwyezjrqobzow/settings/api'

export function isPlaceholder(v: string | undefined): boolean {
  if (!v || v.length < 8) return true
  if (/^your_/i.test(v)) return true
  if (/[<>]/.test(v)) return true
  if (/[^\x20-\x7e]/.test(v)) return true
  return false
}

export function loadEnv(): void {
  try {
    // Node 22 built-in; loads .env from cwd. Harness is always run from repo root.
    ;(process as unknown as { loadEnvFile: (p?: string) => void }).loadEnvFile()
  } catch {
    // .env absent, or already loaded — env vars may be set another way. Non-fatal.
  }
}

export function assertServiceRoleKey(env: NodeJS.ProcessEnv): { url: string; key: string } {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error(`SUPABASE_URL missing — set it in .env. Get project settings at ${DASH}`)
  if (isPlaceholder(key) || (key && key.length < 20)) {
    throw new Error(`SUPABASE_SERVICE_ROLE_KEY missing or placeholder — paste the real key into .env from ${DASH}`)
  }
  return { url, key: key as string }
}
```

- [ ] **Step 4: Run test to verify it passes.**
Run: `cd /c/tmp/turnkey-nightly-agents && npx vitest run tests/agents/env.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit.**

```bash
git add scripts/agents/lib/env.ts tests/agents/env.test.ts
git commit -m "feat(agents): env loader + service-role key guard"
```

### Task 1.2: `lib/claude.ts` — spawn shell + JSON extraction + rate-limit detection

**Files:**
- Create: `scripts/agents/lib/claude.ts`
- Test: `tests/agents/claude.test.ts`

**Interfaces:**
- Produces:
  - `extractJson(text: string): unknown | null` — first `{` … last `}` → `JSON.parse`, `null` on failure.
  - `isRateLimited(text: string): boolean` — true if text matches known Claude subscription rate/usage-limit signatures.
  - `type ClaudeResult = { ok: boolean; text: string; error: string | null; rateLimited: boolean }`
  - `callClaude(opts: { prompt: string; allowedTools?: string[]; timeoutMs?: number }): ClaudeResult` — spawns `claude -p` (plus `--allowedTools "<csv>"` when tools given), prompt via stdin, `shell: true`. Never throws; failures come back as `{ ok:false, error }`. Sets `rateLimited` when stdout+stderr trips `isRateLimited`.

- [ ] **Step 1: Write the failing test** `tests/agents/claude.test.ts` (pure functions only — `callClaude` is exercised in the phase verification, not unit-tested):

```ts
import { describe, it, expect } from 'vitest'
import { extractJson, isRateLimited } from '../../scripts/agents/lib/claude'

describe('extractJson', () => {
  it('parses a bare object', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
  })
  it('parses JSON embedded in prose and code fences', () => {
    expect(extractJson('Sure!\n```json\n{"a":1,"b":[2,3]}\n```\nDone')).toEqual({ a: 1, b: [2, 3] })
  })
  it('returns null when no JSON object present', () => {
    expect(extractJson('no json here')).toBeNull()
    expect(extractJson('')).toBeNull()
  })
  it('returns null on malformed JSON', () => {
    expect(extractJson('{"a": }')).toBeNull()
  })
})

describe('isRateLimited', () => {
  it('detects usage/rate limit phrasings', () => {
    expect(isRateLimited('Claude usage limit reached')).toBe(true)
    expect(isRateLimited('rate limit exceeded, please try again later')).toBe(true)
    expect(isRateLimited('5-hour limit reached ∙ resets at 9pm')).toBe(true)
    expect(isRateLimited('Error: 429 Too Many Requests')).toBe(true)
  })
  it('does not flag normal output', () => {
    expect(isRateLimited('{"properties":[]}')).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails.**
Run: `cd /c/tmp/turnkey-nightly-agents && npx vitest run tests/agents/claude.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `scripts/agents/lib/claude.ts`:**

```ts
import { spawnSync } from 'node:child_process'

export function extractJson(text: string): unknown | null {
  const s = String(text ?? '')
  const a = s.indexOf('{')
  const b = s.lastIndexOf('}')
  if (a === -1 || b === -1 || b < a) return null
  try {
    return JSON.parse(s.slice(a, b + 1))
  } catch {
    return null
  }
}

// Best-effort match of Claude Code subscription rate/usage-limit output. Tune the
// list if real output differs; keep it conservative (false negative = a wasted
// retry next night, false positive = an unnecessary quiet-night skip).
const RATE_SIGNATURES = [
  /usage limit/i,
  /rate limit/i,
  /\b\d+-hour limit reached/i,
  /\b429\b/,
  /too many requests/i,
  /resets? at/i,
]

export function isRateLimited(text: string): boolean {
  const s = String(text ?? '')
  return RATE_SIGNATURES.some((re) => re.test(s))
}

export type ClaudeResult = { ok: boolean; text: string; error: string | null; rateLimited: boolean }

export function callClaude(opts: {
  prompt: string
  allowedTools?: string[]
  timeoutMs?: number
}): ClaudeResult {
  const argv = ['-p']
  if (opts.allowedTools && opts.allowedTools.length) {
    argv.push('--allowedTools', opts.allowedTools.join(','))
  }
  let res: ReturnType<typeof spawnSync>
  try {
    // stdin prompt (avoids arg-escaping multi-line JSON); shell:true so Windows
    // resolves the `claude` .cmd shim. Cred-free: no secret in prompt or argv.
    res = spawnSync('claude', argv, {
      input: opts.prompt,
      encoding: 'utf8',
      timeout: opts.timeoutMs ?? 180000,
      shell: true,
      maxBuffer: 4 * 1024 * 1024,
    })
  } catch (e) {
    return { ok: false, text: '', error: String((e as Error).message ?? e), rateLimited: false }
  }
  const stdout = res.stdout ?? ''
  const stderr = res.stderr ?? ''
  const combined = `${stdout}\n${stderr}`
  const rateLimited = isRateLimited(combined)
  const err = res.error ? String((res.error as Error).message ?? res.error) : null
  const ok = !err && !rateLimited && res.status === 0 && stdout.trim().length > 0
  return { ok, text: stdout, error: err ?? (rateLimited ? 'rate-limited' : res.status !== 0 ? `exit ${res.status}` : null), rateLimited }
}
```

- [ ] **Step 4: Run test to verify it passes.**
Run: `cd /c/tmp/turnkey-nightly-agents && npx vitest run tests/agents/claude.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit.**

```bash
git add scripts/agents/lib/claude.ts tests/agents/claude.test.ts
git commit -m "feat(agents): claude -p spawn shell + JSON extraction + rate-limit detection"
```

### Task 1.3: `lib/db.ts` — service-role admin client + write helpers

**Files:**
- Create: `scripts/agents/lib/db.ts`

**Interfaces:**
- Consumes: `assertServiceRoleKey` (Task 1.1), `@supabase/supabase-js`.
- Produces:
  - `type Db = SupabaseClient`
  - `createAdminClient(env?: NodeJS.ProcessEnv): Db` — validates via `assertServiceRoleKey`, returns a service-role client (no session persistence).
  - `upsertProperty(db, row): Promise<{ id: string } | null>` — upsert into `properties` onConflict `address,city,state`, `.select('id').single()`.
  - `insertAgentRun(db, row): Promise<string>` / `updateAgentRun(db, id, patch): Promise<void>` (used by run-log).
  - Phase-2 helpers declared in Task 2.x: `insertAnalysis`, `insertPredictions`, `updatePropertyMarketStatus`, `insertStatusHistory`, `dismissRecommendations`, `updatePredictionAccuracy`, `upsertRecommendation`, `setStale`, `clearStale`.

  This task creates the client + `upsertProperty` + the two `agent_run` primitives (Phase 1 surface). Phase-2 helpers are appended in their tasks.

Note: `db.ts` has no pure logic to TDD (it is a thin Supabase wrapper); its correctness is proven by the live `--stage=scout` verification (Task 1.8). The guard it depends on IS unit-tested (Task 1.1).

- [ ] **Step 1: Write `scripts/agents/lib/db.ts`:**

```ts
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertServiceRoleKey } from './env'

export type Db = SupabaseClient

export function createAdminClient(env: NodeJS.ProcessEnv = process.env): Db {
  const { url, key } = assertServiceRoleKey(env)
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export type PropertyRow = {
  address: string; city: string; state: string; zip: string
  property_type: string
  bedrooms?: number | null; bathrooms?: number | null; sqft?: number | null; year_built?: number | null
  list_price: number; estimated_value: number
  source: 'autoscout' | 'agent_scout'
  raw_data: Record<string, unknown>
}

export async function upsertProperty(db: Db, row: PropertyRow): Promise<{ id: string } | null> {
  const { data, error } = await db
    .from('properties')
    .upsert(row, { onConflict: 'address,city,state' })
    .select('id')
    .single()
  if (error) {
    console.error(`  upsertProperty failed for ${row.address}: ${error.message}`)
    return null
  }
  return data as { id: string }
}

export async function insertAgentRun(
  db: Db,
  row: { agent_type: string; trigger: 'cron' | 'manual' | 'auto'; input_summary?: string },
): Promise<string> {
  const { data, error } = await db
    .from('agent_runs')
    .insert({ ...row, status: 'running' })
    .select('id')
    .single()
  if (error) throw new Error(`insertAgentRun failed: ${error.message}`)
  return (data as { id: string }).id
}

export async function updateAgentRun(
  db: Db,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await db.from('agent_runs').update(patch).eq('id', id)
  if (error) console.error(`updateAgentRun ${id} failed: ${error.message}`)
}
```

- [ ] **Step 2: Type-check the new file compiles.**
Run: `cd /c/tmp/turnkey-nightly-agents && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "scripts/agents" || echo "no agent type errors"`
Expected: `no agent type errors` (tsconfig.app.json includes only `src`; this confirms the import graph resolves — if the harness files are excluded from that project, instead run `npx tsx -e "import('./scripts/agents/lib/db.ts').then(()=>console.log('ok'))"` and expect `ok`).

- [ ] **Step 3: Commit.**

```bash
git add scripts/agents/lib/db.ts
git commit -m "feat(agents): service-role admin client + property/agent_run write helpers"
```

### Task 1.4: `lib/run-log.ts` — agent_runs lifecycle (cost_est:0, subscription model)

**Files:**
- Create: `scripts/agents/lib/run-log.ts`
- Test: `tests/agents/run-log.test.ts`

**Interfaces:**
- Consumes: `insertAgentRun`, `updateAgentRun` (Task 1.3).
- Produces:
  - `const SUBSCRIPTION_MODEL = 'claude-code-subscription'`
  - `buildFinishPatch(args: { status: 'success'|'error'|'timeout'; output_summary?: string; input_summary?: string }): Record<string, unknown>` — pure; always sets `cost_est: 0`, `model: SUBSCRIPTION_MODEL`, `tokens_used: 0`, `completed_at` (ISO), and merges provided fields.
  - `startRun(db, agent_type, trigger, input_summary?): Promise<string>`
  - `finishRun(db, id, args): Promise<void>`

- [ ] **Step 1: Write the failing test** `tests/agents/run-log.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildFinishPatch, SUBSCRIPTION_MODEL } from '../../scripts/agents/lib/run-log'

describe('buildFinishPatch', () => {
  it('always zeroes cost and stamps the subscription model', () => {
    const p = buildFinishPatch({ status: 'success', output_summary: 'Found 4 listings' })
    expect(p.cost_est).toBe(0)
    expect(p.tokens_used).toBe(0)
    expect(p.model).toBe(SUBSCRIPTION_MODEL)
    expect(p.status).toBe('success')
    expect(p.output_summary).toBe('Found 4 listings')
    expect(typeof p.completed_at).toBe('string')
  })
  it('supports timeout (quiet-night) status', () => {
    expect(buildFinishPatch({ status: 'timeout' }).status).toBe('timeout')
  })
})
```

- [ ] **Step 2: Run test to verify it fails.**
Run: `cd /c/tmp/turnkey-nightly-agents && npx vitest run tests/agents/run-log.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `scripts/agents/lib/run-log.ts`:**

```ts
import { insertAgentRun, updateAgentRun, type Db } from './db'

export const SUBSCRIPTION_MODEL = 'claude-code-subscription'

export function buildFinishPatch(args: {
  status: 'success' | 'error' | 'timeout'
  output_summary?: string
  input_summary?: string
}): Record<string, unknown> {
  const patch: Record<string, unknown> = {
    status: args.status,
    cost_est: 0,
    tokens_used: 0,
    model: SUBSCRIPTION_MODEL,
    completed_at: new Date().toISOString(),
  }
  if (args.output_summary !== undefined) patch.output_summary = args.output_summary
  if (args.input_summary !== undefined) patch.input_summary = args.input_summary
  return patch
}

export function startRun(
  db: Db,
  agent_type: string,
  trigger: 'cron' | 'manual' | 'auto',
  input_summary?: string,
): Promise<string> {
  return insertAgentRun(db, { agent_type, trigger, input_summary })
}

export function finishRun(
  db: Db,
  id: string,
  args: Parameters<typeof buildFinishPatch>[0],
): Promise<void> {
  return updateAgentRun(db, id, buildFinishPatch(args))
}
```

- [ ] **Step 4: Run test to verify it passes.**
Run: `cd /c/tmp/turnkey-nightly-agents && npx vitest run tests/agents/run-log.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit.**

```bash
git add scripts/agents/lib/run-log.ts tests/agents/run-log.test.ts
git commit -m "feat(agents): agent_runs lifecycle helpers (cost_est:0, subscription model)"
```

### Task 1.5: `lib/enrich.ts` — HTTP call to deployed agent-enricher

**Files:**
- Create: `scripts/agents/lib/enrich.ts`

**Interfaces:**
- Consumes: `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` from env (via the client's key — reused).
- Produces:
  - `type EnrichResult = { results: Record<string, unknown>; fetched_at?: string }`
  - `enrichMarket(args: { url: string; key: string; region: string; region_type?: 'zip'|'county'|'metro'; data_types: string[]; lat?: number; lng?: number }): Promise<EnrichResult>` — POST to `${url}/functions/v1/agent-enricher` with `Authorization: Bearer ${key}`; returns `{ results: {} }` on any failure (non-fatal, mirrors the plan's graceful-degradation ethos).

No pure logic beyond graceful fallback; correctness proven in Task 1.8's live run (scout prompt includes market context when enrichment succeeds).

- [ ] **Step 1: Write `scripts/agents/lib/enrich.ts`:**

```ts
export type EnrichResult = { results: Record<string, unknown>; fetched_at?: string }

export async function enrichMarket(args: {
  url: string
  key: string
  region: string
  region_type?: 'zip' | 'county' | 'metro'
  data_types: string[]
  lat?: number
  lng?: number
}): Promise<EnrichResult> {
  const base = args.url.replace(/\/$/, '')
  try {
    const res = await fetch(`${base}/functions/v1/agent-enricher`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${args.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        region: args.region,
        region_type: args.region_type ?? 'zip',
        data_types: args.data_types,
        ...(args.lat != null && args.lng != null ? { lat: args.lat, lng: args.lng } : {}),
      }),
    })
    if (!res.ok) {
      console.error(`  enrichMarket ${args.region}: HTTP ${res.status} — proceeding without enrichment`)
      return { results: {} }
    }
    return (await res.json()) as EnrichResult
  } catch (e) {
    console.error(`  enrichMarket ${args.region}: ${String((e as Error).message ?? e)} — proceeding without enrichment`)
    return { results: {} }
  }
}
```

- [ ] **Step 2: Verify it imports/compiles.**
Run: `cd /c/tmp/turnkey-nightly-agents && npx tsx -e "import('./scripts/agents/lib/enrich.ts').then(()=>console.log('ok'))"`
Expected: `ok`.

- [ ] **Step 3: Commit.**

```bash
git add scripts/agents/lib/enrich.ts
git commit -m "feat(agents): enricher HTTP client (graceful degradation)"
```

### Task 1.6: `prompts/scout.md` + `lib/scout.ts` — scout stage

**Files:**
- Read first: `supabase/functions/agent-scout/index.ts` (system prompt 9–25, user prompt 89–123, property upsert 158–181)
- Create: `scripts/agents/prompts/scout.md`
- Create: `scripts/agents/lib/scout.ts`
- Test: `tests/agents/scout.test.ts`

**Interfaces:**
- Consumes: `scoutOutputSchema` from `@/schemas/scout-output`, `extractJson`+`callClaude` (Task 1.2), `enrichMarket` (1.5), `upsertProperty` (1.3), `startRun`/`finishRun` (1.4).
- Produces:
  - `buildScoutPrompt(args: { market: string; marketData: Record<string, unknown>; filters: Record<string, unknown> }): string` — pure; concatenates the ported system md + injected market data + filters + the required-JSON-output spec (properties[] incl. `listing_url`/`image_url`, `market_summary`, `data_sources_used`).
  - `parseScoutOutput(raw: string): ScoutOutput & { properties: RawScoutProperty[] }` — pure; `extractJson` then `scoutOutputSchema.parse`, but retains `listing_url`/`image_url` off the raw parse (schema strips them). Throws on invalid.
  - `mapScoutPropertyToRow(p, source): PropertyRow` — pure; maps a validated+raw scout property to the exact `properties` upsert shape, `source` param (`'autoscout'` nightly).
  - `runScout(deps: { db, url, key, market, filters?, dryRun }): Promise<{ found: number; saved: number }>` — I/O shell.

- [ ] **Step 1: Port the system prompt.** Read `supabase/functions/agent-scout/index.ts` lines 9–25 and copy the `SCOUT_SYSTEM_PROMPT` string literal content **verbatim** into `scripts/agents/prompts/scout.md` (markdown body, no TS quoting). Do not paraphrase.

- [ ] **Step 2: Write the failing test** `tests/agents/scout.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { buildScoutPrompt, parseScoutOutput, mapScoutPropertyToRow } from '../../scripts/agents/lib/scout'

const sample = {
  properties: [{
    address: '123 Main St', city: 'Trenton', state: 'NJ', zip: '08601',
    property_type: 'single_family', bedrooms: 3, bathrooms: 2, sqft: 1500, year_built: 1960,
    list_price: 250000, score: 82, rationale: 'Below comps', recommended_strategy: 'flip',
    estimated_flip_roi: 18, estimated_cap_rate: 7,
    listing_url: 'https://zillow.com/x', image_url: null,
  }],
  market_summary: 'Stable', data_sources_used: ['zillow'],
}

describe('buildScoutPrompt', () => {
  it('injects the market ZIP and demands JSON-only output', () => {
    const p = buildScoutPrompt({ market: '08601', marketData: { foo: 1 }, filters: {} })
    expect(p).toContain('08601')
    expect(p).toMatch(/JSON/i)
    expect(p).toContain('properties')
  })
})

describe('parseScoutOutput', () => {
  it('validates against the Zod schema and keeps listing_url/image_url', () => {
    const out = parseScoutOutput(JSON.stringify(sample))
    expect(out.properties[0].address).toBe('123 Main St')
    expect(out.properties[0].listing_url).toBe('https://zillow.com/x')
  })
  it('throws on schema violation (score out of range)', () => {
    const bad = { ...sample, properties: [{ ...sample.properties[0], score: 999 }] }
    expect(() => parseScoutOutput(JSON.stringify(bad))).toThrow()
  })
  it('throws when no JSON present', () => {
    expect(() => parseScoutOutput('sorry, nothing found')).toThrow()
  })
})

describe('mapScoutPropertyToRow', () => {
  it('maps to the properties upsert shape with the given source', () => {
    const out = parseScoutOutput(JSON.stringify(sample))
    const row = mapScoutPropertyToRow(out.properties[0], 'autoscout')
    expect(row.source).toBe('autoscout')
    expect(row.estimated_value).toBe(250000)
    expect(row.raw_data.score).toBe(82)
    expect(row.raw_data.listing_url).toBe('https://zillow.com/x')
    expect(row.raw_data).toHaveProperty('scouted_at')
  })
})
```

- [ ] **Step 3: Run test to verify it fails.**
Run: `cd /c/tmp/turnkey-nightly-agents && npx vitest run tests/agents/scout.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 4: Write `scripts/agents/lib/scout.ts`:**

```ts
import fs from 'node:fs'
import path from 'node:path'
import { scoutOutputSchema } from '@/schemas/scout-output'
import { callClaude, extractJson } from './claude'
import { enrichMarket } from './enrich'
import { upsertProperty, type Db, type PropertyRow } from './db'
import { startRun, finishRun } from './run-log'

const SYSTEM = fs.readFileSync(path.join(import.meta.dirname, '..', 'prompts', 'scout.md'), 'utf8')

export type RawScoutProperty = {
  address: string; city: string; state: string; zip: string; property_type: string
  bedrooms?: number; bathrooms?: number; sqft?: number; year_built?: number
  list_price: number; score: number; rationale: string; recommended_strategy: string
  estimated_flip_roi?: number; estimated_cap_rate?: number
  listing_url?: string | null; image_url?: string | null
}

export function buildScoutPrompt(args: {
  market: string
  marketData: Record<string, unknown>
  filters: Record<string, unknown>
}): string {
  return [
    SYSTEM,
    '',
    `Find investment-grade real-estate listings currently for sale in ZIP ${args.market}.`,
    `Use web search over major listing sites (zillow, redfin, realtor, homes, trulia, movoto, opendoor). Only include REAL, currently-listed properties with a listing_url. Never fabricate.`,
    '',
    `Market context (from public data sources): ${JSON.stringify(args.marketData)}`,
    `Buyer filters: ${JSON.stringify(args.filters)}`,
    '',
    `Respond with ONLY a JSON object (no prose, no code fence) of this exact shape:`,
    `{"properties":[{"address":str,"city":str,"state":str(2),"zip":str,"property_type":"single_family|condo|multi_family|townhouse","bedrooms":int?,"bathrooms":num?,"sqft":int?,"year_built":int?,"list_price":num,"score":int(0-100),"rationale":str,"recommended_strategy":"flip|rental|either","estimated_flip_roi":num?,"estimated_cap_rate":num?,"listing_url":str,"image_url":str|null}],"market_summary":str,"data_sources_used":[str]}`,
  ].join('\n')
}

export function parseScoutOutput(raw: string): { properties: RawScoutProperty[]; market_summary: string; data_sources_used: string[] } {
  const parsed = extractJson(raw)
  if (!parsed) throw new Error('scout: no JSON object in output')
  scoutOutputSchema.parse(parsed) // validates core fields; throws on violation
  const p = parsed as { properties: RawScoutProperty[]; market_summary: string; data_sources_used: string[] }
  return p
}

export function mapScoutPropertyToRow(p: RawScoutProperty, source: 'autoscout' | 'agent_scout'): PropertyRow {
  return {
    address: p.address, city: p.city, state: p.state, zip: p.zip,
    property_type: p.property_type,
    bedrooms: p.bedrooms ?? null, bathrooms: p.bathrooms ?? null,
    sqft: p.sqft ?? null, year_built: p.year_built ?? null,
    list_price: p.list_price, estimated_value: p.list_price,
    source,
    raw_data: {
      score: p.score, rationale: p.rationale, recommended_strategy: p.recommended_strategy,
      estimated_flip_roi: p.estimated_flip_roi ?? null, estimated_cap_rate: p.estimated_cap_rate ?? null,
      listing_url: p.listing_url ?? null, image_url: p.image_url ?? null,
      scouted_at: new Date().toISOString(),
    },
  }
}

export async function runScout(deps: {
  db: Db; url: string; key: string; market: string
  filters?: Record<string, unknown>; dryRun: boolean
}): Promise<{ found: number; saved: number }> {
  const { db, url, key, market, dryRun } = deps
  const filters = deps.filters ?? {}
  if (dryRun) {
    console.log(`  [dry-run] scout ${market}: would enrich + call claude -p (web) + upsert properties`)
    return { found: 0, saved: 0 }
  }
  const runId = await startRun(db, 'scout', 'manual', `Market: ${market}`)
  try {
    const enrich = await enrichMarket({ url, key, region: market, data_types: ['census_acs', 'fred_rates', 'hud_fmr', 'bls_unemployment'] })
    const prompt = buildScoutPrompt({ market, marketData: enrich.results ?? {}, filters })
    const res = callClaude({ prompt, allowedTools: ['WebSearch', 'WebFetch'], timeoutMs: 240000 })
    if (res.rateLimited) throw Object.assign(new Error('rate-limited'), { rateLimited: true })
    if (!res.ok) throw new Error(res.error ?? 'scout: claude call failed')
    const out = parseScoutOutput(res.text)
    let saved = 0
    for (const p of out.properties) {
      const row = mapScoutPropertyToRow(p, 'autoscout')
      const r = await upsertProperty(db, row)
      if (r) saved++
    }
    await finishRun(db, runId, { status: 'success', output_summary: `Found ${out.properties.length} real listings in ${market}` })
    return { found: out.properties.length, saved }
  } catch (e) {
    const rl = (e as { rateLimited?: boolean }).rateLimited === true
    await finishRun(db, runId, { status: rl ? 'timeout' : 'error', output_summary: String((e as Error).message ?? e).slice(0, 200) })
    throw e
  }
}
```

- [ ] **Step 5: Run test to verify it passes.**
Run: `cd /c/tmp/turnkey-nightly-agents && npx vitest run tests/agents/scout.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit.**

```bash
git add scripts/agents/prompts/scout.md scripts/agents/lib/scout.ts tests/agents/scout.test.ts
git commit -m "feat(agents): scout stage — prompt build, zod-validated parse, property mapping"
```

### Task 1.7: `run-nightly.ts` — orchestrator CLI (kill-switch, args, caps, scout stage)

**Files:**
- Create: `scripts/agents/run-nightly.ts`
- Test: `tests/agents/run-nightly.test.ts`

**Interfaces:**
- Consumes: everything above.
- Produces (pure, exported for tests):
  - `parseArgs(argv: string[]): { dryRun: boolean; stage: string | null; watchlist: string | null }`
  - `isAutonomyOff(env: NodeJS.ProcessEnv): boolean`
  - `const CAPS = { watchlists: 3, analyst: 10, marks: 15 }`
  - `selectActiveWatchlists(rows, cap): typeof rows` — pure; takes `active` watchlists, caps to N.
  - `main(): Promise<number>` — I/O shell; returns process exit code.

- [ ] **Step 1: Write the failing test** `tests/agents/run-nightly.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseArgs, isAutonomyOff, selectActiveWatchlists, CAPS } from '../../scripts/agents/run-nightly'

describe('parseArgs', () => {
  it('defaults to a full live run', () => {
    expect(parseArgs([])).toEqual({ dryRun: false, stage: null, watchlist: null })
  })
  it('parses --dry-run, --stage=, --watchlist=', () => {
    expect(parseArgs(['--dry-run', '--stage=scout', '--watchlist=abc'])).toEqual({
      dryRun: true, stage: 'scout', watchlist: 'abc',
    })
  })
})

describe('isAutonomyOff', () => {
  it('is true only when the kill switch is a non-empty value', () => {
    expect(isAutonomyOff({} as NodeJS.ProcessEnv)).toBe(false)
    expect(isAutonomyOff({ TURNKEY_AUTONOMY_OFF: '' } as NodeJS.ProcessEnv)).toBe(false)
    expect(isAutonomyOff({ TURNKEY_AUTONOMY_OFF: '1' } as NodeJS.ProcessEnv)).toBe(true)
  })
})

describe('selectActiveWatchlists', () => {
  it('keeps only active and caps to N', () => {
    const rows = [
      { id: 'a', active: true }, { id: 'b', active: false },
      { id: 'c', active: true }, { id: 'd', active: true }, { id: 'e', active: true },
    ]
    const out = selectActiveWatchlists(rows, CAPS.watchlists)
    expect(out.map((r) => r.id)).toEqual(['a', 'c', 'd'])
  })
})
```

- [ ] **Step 2: Run test to verify it fails.**
Run: `cd /c/tmp/turnkey-nightly-agents && npx vitest run tests/agents/run-nightly.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write `scripts/agents/run-nightly.ts`** (Phase-1 scope: kill-switch, args, scout stage over capped active watchlists; analyst/market-check/tracker wired in Phase 2 — leave a clearly-marked seam):

```ts
import { loadEnv, assertServiceRoleKey } from './lib/env'
import { createAdminClient } from './lib/db'
import { runScout } from './lib/scout'

export const CAPS = { watchlists: 3, analyst: 10, marks: 15 }

export function parseArgs(argv: string[]): { dryRun: boolean; stage: string | null; watchlist: string | null } {
  let dryRun = false, stage: string | null = null, watchlist: string | null = null
  for (const a of argv) {
    if (a === '--dry-run') dryRun = true
    else if (a.startsWith('--stage=')) stage = a.slice('--stage='.length)
    else if (a.startsWith('--watchlist=')) watchlist = a.slice('--watchlist='.length)
  }
  return { dryRun, stage, watchlist }
}

export function isAutonomyOff(env: NodeJS.ProcessEnv): boolean {
  return !!env.TURNKEY_AUTONOMY_OFF && env.TURNKEY_AUTONOMY_OFF.length > 0
}

export function selectActiveWatchlists<T extends { active: boolean }>(rows: T[], cap: number): T[] {
  return rows.filter((r) => r.active).slice(0, cap)
}

export async function main(): Promise<number> {
  loadEnv()
  const args = parseArgs(process.argv.slice(2))
  const stamp = new Date().toISOString()
  console.log(`\n🏠 Turnkey nightly — ${stamp} ${args.dryRun ? '(DRY RUN)' : ''}`)

  if (isAutonomyOff(process.env)) {
    console.log('   TURNKEY_AUTONOMY_OFF set — skipping all stages. Exit 0.')
    return 0
  }

  const { url, key } = assertServiceRoleKey(process.env)
  const db = createAdminClient(process.env)

  // ── Stage: scout ─────────────────────────────────────────────
  if (!args.stage || args.stage === 'scout') {
    const q = db.from('watchlists').select('id, name, zip, user_id, active, criteria_overrides')
    const { data: wlAll, error } = args.watchlist ? await q.eq('id', args.watchlist) : await q
    if (error) { console.error(`   watchlists query failed: ${error.message}`); return 1 }
    const watchlists = selectActiveWatchlists((wlAll ?? []) as Array<{ active: boolean; id: string; zip: string; name: string }>, CAPS.watchlists)
    console.log(`   scout: ${watchlists.length} active watchlist(s) (cap ${CAPS.watchlists})`)
    for (const wl of watchlists) {
      try {
        const r = await runScout({ db, url, key, market: wl.zip, dryRun: args.dryRun })
        console.log(`   ✓ ${wl.name} (${wl.zip}): found ${r.found}, saved ${r.saved}`)
      } catch (e) {
        if ((e as { rateLimited?: boolean }).rateLimited) {
          console.log('   ⏸ quiet night (rate-limited during scout) — stopping, exit 0.')
          return 0
        }
        console.error(`   ✗ ${wl.name} (${wl.zip}): ${String((e as Error).message ?? e)}`)
      }
    }
  }

  // ── Phase 2 seam: analyst → market-check → recommendation → stale → tracker ──
  // (wired in Task 2.6)

  console.log('   done.')
  return 0
}

// Only run main() when executed directly, not when imported by tests.
const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('run-nightly.ts')
if (invokedDirectly) {
  main().then((code) => process.exit(code)).catch((e) => { console.error('nightly error:', e); process.exit(1) })
}
```

- [ ] **Step 4: Run test to verify it passes.**
Run: `cd /c/tmp/turnkey-nightly-agents && npx vitest run tests/agents/run-nightly.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Verify `--dry-run` runs end-to-end with no writes** (needs a real service-role key in `.env`; if absent, this asserts the guard fires instead):

Run: `cd /c/tmp/turnkey-nightly-agents && npx tsx scripts/agents/run-nightly.ts --dry-run; echo "exit=$?"`
Expected: either (a) with a real key: prints the header, watchlist count, `[dry-run] scout … would enrich…` lines, `done.`, `exit=0`; or (b) without a real key: throws the guard error naming the dashboard link, `exit=1`. Both are acceptable proofs at this step; the live run is Task 1.8.

- [ ] **Step 6: Commit.**

```bash
git add scripts/agents/run-nightly.ts tests/agents/run-nightly.test.ts
git commit -m "feat(agents): nightly orchestrator CLI — kill-switch, args, caps, scout stage"
```

### Task 1.8: `run-nightly.bat` + schtasks registration + live scout verification

**Files:**
- Create: `scripts/agents/run-nightly.bat`
- Create: `scripts/agents/README.md`

**Interfaces:**
- Produces: a Windows batch wrapper that `cd`s to the repo and runs `npx tsx scripts/agents/run-nightly.ts`, and the documented `schtasks` registration.

- [ ] **Step 1: Write `scripts/agents/run-nightly.bat`** (note: the scheduled task must run against the **main checkout**, not this worktree, once merged — the .bat is written to reference the repo root it lives in):

```bat
@echo off
REM Turnkey nightly agent harness — registered via schtasks at 02:30 daily.
REM Kill switch: set TURNKEY_AUTONOMY_OFF=1 in .env to disable without unregistering.
REM Register:
REM   schtasks /Create /TN "TurnkeyNightly" /TR "\"%~dp0run-nightly.bat\"" /SC DAILY /ST 02:30 /F
REM Delete:
REM   schtasks /Delete /TN "TurnkeyNightly" /F
cd /d "%~dp0..\.."
call npx tsx scripts/agents/run-nightly.ts >> ".ingest-logs\turnkey-nightly.log" 2>&1
```

(If `.ingest-logs` does not exist in this repo, change the redirect target to `scripts\agents\nightly.log` and add that path to `.gitignore`.)

- [ ] **Step 2: Write `scripts/agents/README.md`** documenting: purpose (subscription-native nightly pipeline), how to run (`npm run agents:nightly`, `--dry-run`, `--stage=scout`, `--watchlist=<id>`), the kill switch, the caps, quiet-night semantics, the `.env` requirement (service-role key), the schtasks register/delete commands, and a pointer to `docs/SECURITY-ROTATION.md`. Note explicitly: **all LLM calls are `claude -p` (subscription) — $0 gateway spend; the deployed edge functions remain as a manual fallback.**

- [ ] **Step 3: Live scout verification (requires real `.env`).** With a valid service-role key in `.env` and at least one active watchlist in the DB:

Run: `cd /c/tmp/turnkey-nightly-agents && npx tsx scripts/agents/run-nightly.ts --stage=scout`
Expected: header, `scout: N active watchlist(s)`, per-watchlist `✓ … found X, saved Y`, `done.`, exit 0. This spawns real `claude -p --allowedTools WebSearch,WebFetch` calls (subscription).

- [ ] **Step 4: Confirm the writes landed with the right contract** (query via Supabase MCP or a throwaway tsx snippet using the admin client — do NOT print the key):

Verify: a recent `properties` row with `source = 'autoscout'` and a populated `raw_data.score`; a recent `agent_runs` row with `agent_type='scout'`, `cost_est=0`, `model='claude-code-subscription'`, `status='success'`. Confirm the Scout page (`/scout`) query is `useProperties({source:'agent_scout'})` — **note:** the Scout page filters on `source='agent_scout'`, while nightly rows are `source='autoscout'`. The dashboard (`/`) also uses `{source:'agent_scout'}`. **Decision required (see Task 1.9).**

- [ ] **Step 5: Register the scheduled task** (machine-state change — reversible; documented in the .bat). Run against the **main checkout path** after merge, or for pre-merge testing point it at the worktree:

Run: `schtasks /Create /TN "TurnkeyNightly" /TR "\"C:\\Users\\shawn\\OneDrive\\Documents\\ADL-Foundry\\GitRepositories\\turnkey\\scripts\\agents\\run-nightly.bat\"" /SC DAILY /ST 02:30 /F`
Expected: `SUCCESS: The scheduled task "TurnkeyNightly" has successfully been created.`
Then force one unattended run: `schtasks /Run /TN "TurnkeyNightly"` and confirm the log file shows a completed run.

- [ ] **Step 6: Commit.**

```bash
git add scripts/agents/run-nightly.bat scripts/agents/README.md
git commit -m "feat(agents): batch wrapper + schtasks registration + ops README"
```

### Task 1.9: Resolve source-visibility (`autoscout` vs `agent_scout`) — HALT/DECIDE

The Scout page and dashboard filter `properties` on `source='agent_scout'`, but the autoscout path (and this harness) writes `source='autoscout'`. This predates this work — the existing `agent-autoscout` edge function already writes `autoscout`, so its output has the same visibility question. Two facts must be checked before claiming the Phase-1 exit criterion ("properties visible in the Scout page"):

- [ ] **Step 1:** Grep the UI for how `autoscout`-sourced properties surface. Recommended-deals (`useRecommended` → `user_recommendations`) and the predictions/pipeline flows do NOT filter by `source`, so autoscout rows surface there once the orchestrator recommends them. The **Scout page's saved-list** specifically filters `agent_scout`.
- [ ] **Step 2:** Confirm the plan's intent. The Phase-1 verify says "properties visible in the Scout page." If autoscout rows are meant to appear in the Scout list, the correct zero-UI-change fix is to write `source='autoscout'` (as specified) and rely on the dashboard's **RecommendedDeals** (post-orchestration, Phase 2) for visibility — OR the plan accepts that Phase-1 scout rows are visible via the map/property views (which don't filter source). **Do not modify `src/`.** If genuine ambiguity remains about where Phase-1 scout output must be visible, this is a Tier-2 halt: surface to Shawn with the two options (write `autoscout` per plan and verify via map/recommended; vs. write `agent_scout` to match the Scout list filter) rather than silently choosing.
- [ ] **Step 3:** Record the resolution in `scripts/agents/README.md` under a "Source & visibility" heading and proceed. (Default per plan text if Shawn is unavailable: keep `source='autoscout'`; verify visibility via the map view and, after Phase 2, the dashboard RecommendedDeals — since that is what the deployed autoscout function already does.)

**Phase 1 complete when:** unit tests green; `--dry-run` clean; one real `--stage=scout` wrote `autoscout` properties + a `cost_est:0` scout run; schtasks registered and one unattended run logged; source-visibility resolved and documented.

---

# PHASE 2 — Analyst + market-check + tracker + cutover

**Exit criteria:** a full `npx tsx scripts/agents/run-nightly.ts` (no `--stage`) runs scout → per-property analyst + market-check → recommendation gating → stale flagging → tracker, populating `property_analyses`, `property_predictions`, `user_recommendations`, and `property_status_history`; the dashboard/predictions pages show fresh data with **zero UI changes**; a `properties/agent_runs` audit shows every run `cost_est=0` / `model='claude-code-subscription'` (⇒ $0 gateway spend); `autoscout-daily` pg_cron is unscheduled (operator step) and migration `00008` documents the cutover; the branch lands via PR.

### Task 2.1: `prompts/analyst.md` + `lib/analyst.ts`

**Files:**
- Read first: `supabase/functions/agent-analyst/index.ts` (system 6–51, user 114–123, analysis insert 128–148, predictions 156–160)
- Create: `scripts/agents/prompts/analyst.md`
- Create: `scripts/agents/lib/analyst.ts`
- Test: `tests/agents/analyst.test.ts`
- Modify: `scripts/agents/lib/db.ts` (add `insertAnalysis`, `insertPredictions`)

**Interfaces:**
- Consumes: `analystOutputSchema` from `@/schemas/analyst-output`, `callClaude`/`extractJson`, `enrichMarket`, `startRun`/`finishRun`.
- Produces:
  - `buildAnalystPrompt(args: { property: Record<string, unknown>; marketData: Record<string, unknown>; propertyId: string }): string` — pure.
  - `parseAnalystOutput(raw: string): AnalystOutput` — pure; `extractJson` + `analystOutputSchema.parse`.
  - `mapAnalysisToRow(out: AnalystOutput, propertyId: string, model: string, neighborhood: Record<string, unknown>): AnalysisRow` — pure; **the mapping gotchas**: `rental_monthly_est = out.rental.monthly_rent`, `confidence_score = out.overall_confidence`, `analysis_summary = out.summary`, `neighborhood_data = neighborhood`, `agent_model = model`.
  - `mapPredictionRows(out: AnalystOutput, propertyId: string): PredictionRow[]` — pure; 3 rows: `{metric:'arv', predicted_value: out.flip.arv}`, `{metric:'rental_income', predicted_value: out.rental.monthly_rent}`, `{metric:'renovation_cost', predicted_value: out.flip.renovation_est}`.
  - `runAnalyst(deps): Promise<void>` — I/O shell.

- [ ] **Step 1: Port the system prompt** — copy `ANALYST_SYSTEM_PROMPT` (agent-analyst/index.ts:6–51) verbatim into `scripts/agents/prompts/analyst.md`.

- [ ] **Step 2: Write the failing test** `tests/agents/analyst.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseAnalystOutput, mapAnalysisToRow, mapPredictionRows } from '../../scripts/agents/lib/analyst'

const uuid = '11111111-1111-4111-8111-111111111111'
const sample = {
  property_id: uuid,
  flip: { arv: 320000, renovation_est: 45000, carrying_costs: 8000, total_investment: 300000, profit_margin: 20000, roi: 12, timeline: '6 months', confidence: 70, explanation: 'x' },
  rental: { monthly_rent: 2200, monthly_expenses: 900, monthly_cash_flow: 1300, annual_noi: 15600, cap_rate: 7.2, cash_on_cash: 9, confidence: 65, explanation: 'y' },
  recommended_strategy: 'flip', overall_confidence: 68, summary: 'Solid flip', data_sources_used: ['census_acs'], data_gaps: [],
}

describe('parseAnalystOutput', () => {
  it('validates via the analyst Zod schema', () => {
    expect(parseAnalystOutput(JSON.stringify(sample)).overall_confidence).toBe(68)
  })
  it('throws on a bad UUID', () => {
    expect(() => parseAnalystOutput(JSON.stringify({ ...sample, property_id: 'nope' }))).toThrow()
  })
})

describe('mapAnalysisToRow — mapping gotchas', () => {
  it('maps rental_monthly_est from rental.monthly_rent, confidence_score from overall_confidence, analysis_summary from summary', () => {
    const out = parseAnalystOutput(JSON.stringify(sample))
    const row = mapAnalysisToRow(out, uuid, 'claude-code-subscription', { pop: 1 })
    expect(row.property_id).toBe(uuid)
    expect(row.rental_monthly_est).toBe(2200)
    expect(row.confidence_score).toBe(68)
    expect(row.analysis_summary).toBe('Solid flip')
    expect(row.neighborhood_data).toEqual({ pop: 1 })
    expect(row.agent_model).toBe('claude-code-subscription')
    expect(row.flip_arv).toBe(320000)
  })
})

describe('mapPredictionRows', () => {
  it('emits arv, rental_income, renovation_cost with correct sources', () => {
    const out = parseAnalystOutput(JSON.stringify(sample))
    const rows = mapPredictionRows(out, uuid)
    expect(rows).toEqual([
      { property_id: uuid, metric: 'arv', predicted_value: 320000 },
      { property_id: uuid, metric: 'rental_income', predicted_value: 2200 },
      { property_id: uuid, metric: 'renovation_cost', predicted_value: 45000 },
    ])
  })
})
```

- [ ] **Step 3: Run test to verify it fails.** `npx vitest run tests/agents/analyst.test.ts` → FAIL (module not found).

- [ ] **Step 4: Write `scripts/agents/lib/analyst.ts`** and append DB helpers to `lib/db.ts`:

`lib/db.ts` additions:

```ts
export type AnalysisRow = {
  property_id: string
  flip_arv: number; flip_renovation_est: number; flip_carrying_costs: number
  flip_total_investment: number; flip_profit_margin: number; flip_roi: number; flip_timeline: string
  rental_monthly_est: number; rental_monthly_expenses: number; rental_monthly_cash_flow: number
  rental_annual_noi: number; rental_cap_rate: number; rental_cash_on_cash: number
  recommended_strategy: string; confidence_score: number; analysis_summary: string
  neighborhood_data: Record<string, unknown>; agent_model: string
}
export type PredictionRow = { property_id: string; metric: string; predicted_value: number }

export async function insertAnalysis(db: Db, row: AnalysisRow): Promise<void> {
  const { error } = await db.from('property_analyses').insert(row)
  if (error) throw new Error(`insertAnalysis failed: ${error.message}`)
}
export async function insertPredictions(db: Db, rows: PredictionRow[]): Promise<void> {
  const { error } = await db.from('property_predictions').insert(rows)
  if (error) throw new Error(`insertPredictions failed: ${error.message}`)
}
export async function latestAnalysisConfidence(db: Db, propertyId: string): Promise<number | null> {
  const { data } = await db.from('property_analyses').select('confidence_score')
    .eq('property_id', propertyId).order('analyzed_at', { ascending: false }).limit(1).maybeSingle()
  return (data as { confidence_score: number } | null)?.confidence_score ?? null
}
export async function hasAnalysis(db: Db, propertyId: string): Promise<boolean> {
  const { data } = await db.from('property_analyses').select('id').eq('property_id', propertyId).limit(1).maybeSingle()
  return !!data
}
```

`lib/analyst.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'
import { analystOutputSchema, type AnalystOutput } from '@/schemas/analyst-output'
import { callClaude, extractJson } from './claude'
import { enrichMarket } from './enrich'
import { startRun, finishRun, SUBSCRIPTION_MODEL } from './run-log'
import { insertAnalysis, insertPredictions, type Db, type AnalysisRow, type PredictionRow } from './db'

const SYSTEM = fs.readFileSync(path.join(import.meta.dirname, '..', 'prompts', 'analyst.md'), 'utf8')

export function buildAnalystPrompt(args: { property: Record<string, unknown>; marketData: Record<string, unknown>; propertyId: string }): string {
  return [
    SYSTEM, '',
    `Analyze this property for both flip and rental strategies.`,
    `Property: ${JSON.stringify(args.property)}`,
    `Enriched market/neighborhood data: ${JSON.stringify(args.marketData)}`,
    `property_id (echo it back exactly): ${args.propertyId}`,
    '',
    `Respond with ONLY a JSON object matching: {"property_id":"${args.propertyId}","flip":{"arv":num,"renovation_est":num,"carrying_costs":num,"total_investment":num,"profit_margin":num,"roi":num,"timeline":str,"confidence":int(0-100),"explanation":str},"rental":{"monthly_rent":num,"monthly_expenses":num,"monthly_cash_flow":num,"annual_noi":num,"cap_rate":num,"cash_on_cash":num,"confidence":int(0-100),"explanation":str},"recommended_strategy":"flip|rental|either","overall_confidence":int(0-100),"summary":str,"data_sources_used":[str],"data_gaps":[str]}`,
  ].join('\n')
}

export function parseAnalystOutput(raw: string): AnalystOutput {
  const parsed = extractJson(raw)
  if (!parsed) throw new Error('analyst: no JSON object in output')
  return analystOutputSchema.parse(parsed)
}

export function mapAnalysisToRow(out: AnalystOutput, propertyId: string, model: string, neighborhood: Record<string, unknown>): AnalysisRow {
  return {
    property_id: propertyId,
    flip_arv: out.flip.arv, flip_renovation_est: out.flip.renovation_est, flip_carrying_costs: out.flip.carrying_costs,
    flip_total_investment: out.flip.total_investment, flip_profit_margin: out.flip.profit_margin, flip_roi: out.flip.roi,
    flip_timeline: out.flip.timeline,
    rental_monthly_est: out.rental.monthly_rent, // GOTCHA: LLM field monthly_rent → column rental_monthly_est
    rental_monthly_expenses: out.rental.monthly_expenses, rental_monthly_cash_flow: out.rental.monthly_cash_flow,
    rental_annual_noi: out.rental.annual_noi, rental_cap_rate: out.rental.cap_rate, rental_cash_on_cash: out.rental.cash_on_cash,
    recommended_strategy: out.recommended_strategy,
    confidence_score: out.overall_confidence, // GOTCHA: overall_confidence → confidence_score
    analysis_summary: out.summary,             // GOTCHA: summary → analysis_summary
    neighborhood_data: neighborhood, agent_model: model,
  }
}

export function mapPredictionRows(out: AnalystOutput, propertyId: string): PredictionRow[] {
  return [
    { property_id: propertyId, metric: 'arv', predicted_value: out.flip.arv },
    { property_id: propertyId, metric: 'rental_income', predicted_value: out.rental.monthly_rent },
    { property_id: propertyId, metric: 'renovation_cost', predicted_value: out.flip.renovation_est },
  ]
}

export async function runAnalyst(deps: {
  db: Db; url: string; key: string; property: Record<string, unknown> & { id: string; address: string; city: string; state: string; zip: string; lat?: number | null; lng?: number | null }
}): Promise<void> {
  const { db, url, key, property } = deps
  const runId = await startRun(db, 'analyst', 'auto', `Property: ${property.address}, ${property.city} ${property.state}`)
  try {
    const base = await enrichMarket({ url, key, region: property.zip, data_types: ['census_acs', 'fred_rates', 'hud_fmr', 'bls_unemployment'] })
    let merged = { ...(base.results ?? {}) }
    if (property.lat != null && property.lng != null) {
      const geo = await enrichMarket({ url, key, region: property.zip, data_types: ['fema_flood', 'walkability'], lat: property.lat, lng: property.lng })
      merged = { ...merged, ...(geo.results ?? {}) }
    }
    const prompt = buildAnalystPrompt({ property, marketData: merged, propertyId: property.id })
    const res = callClaude({ prompt, timeoutMs: 180000 }) // no web tools
    if (res.rateLimited) throw Object.assign(new Error('rate-limited'), { rateLimited: true })
    if (!res.ok) throw new Error(res.error ?? 'analyst: claude call failed')
    const out = parseAnalystOutput(res.text)
    await insertAnalysis(db, mapAnalysisToRow(out, property.id, SUBSCRIPTION_MODEL, merged))
    await insertPredictions(db, mapPredictionRows(out, property.id))
    await finishRun(db, runId, { status: 'success', output_summary: `Analyzed ${property.address}: ${out.recommended_strategy} (${out.overall_confidence}% confidence)` })
  } catch (e) {
    const rl = (e as { rateLimited?: boolean }).rateLimited === true
    await finishRun(db, runId, { status: rl ? 'timeout' : 'error', output_summary: String((e as Error).message ?? e).slice(0, 200) })
    throw e
  }
}
```

- [ ] **Step 5: Run test to verify it passes.** `npx vitest run tests/agents/analyst.test.ts` → PASS (5 tests).

- [ ] **Step 6: Commit.**

```bash
git add scripts/agents/prompts/analyst.md scripts/agents/lib/analyst.ts scripts/agents/lib/db.ts tests/agents/analyst.test.ts
git commit -m "feat(agents): analyst stage — zod parse + analysis/prediction mapping (gotchas covered)"
```

### Task 2.2: `prompts/market-check.md` + `lib/market-check.ts`

**Files:**
- Read first: `supabase/functions/agent-market-check/index.ts` (system 9–23, user 58–60, writes 112–138)
- Create: `scripts/agents/prompts/market-check.md`, `scripts/agents/lib/market-check.ts`
- Test: `tests/agents/market-check.test.ts`
- Modify: `scripts/agents/lib/db.ts` (add `updatePropertyMarketStatus`, `insertStatusHistory`, `dismissRecommendations`)

**Interfaces:**
- Produces:
  - `buildMarketCheckPrompt(args: { address; city; state; zip; listing_url?: string | null }): string` — pure.
  - `type MarketCheckOutput = { status: 'active'|'off_market'|'pending'|'sold'|'unknown'; price_current: number | null; notes: string }`
  - `parseMarketCheckOutput(raw: string): MarketCheckOutput` — pure; `extractJson` + a local Zod schema (there is no `src/schemas` file for market-check — define one inline in the lib, `marketCheckSchema`, to honor "validate every output").
  - `wentInactive(prev: string | null, next: string): boolean` — pure; true when `prev` was `active`/null and `next ∈ {off_market, sold}`.
  - `runMarketCheck(deps): Promise<{ status: string }>` — I/O shell.

- [ ] **Step 1: Port the system prompt** — copy `MARKET_CHECK_SYSTEM_PROMPT` (lines 9–23) verbatim into `scripts/agents/prompts/market-check.md`.

- [ ] **Step 2: Write the failing test** `tests/agents/market-check.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseMarketCheckOutput, wentInactive } from '../../scripts/agents/lib/market-check'

describe('parseMarketCheckOutput', () => {
  it('validates status enum + price_current + notes', () => {
    const o = parseMarketCheckOutput('{"status":"active","price_current":250000,"notes":"still listed"}')
    expect(o.status).toBe('active'); expect(o.price_current).toBe(250000)
  })
  it('accepts null price', () => {
    expect(parseMarketCheckOutput('{"status":"sold","price_current":null,"notes":"closed"}').price_current).toBeNull()
  })
  it('throws on an invalid status', () => {
    expect(() => parseMarketCheckOutput('{"status":"foo","price_current":null,"notes":""}')).toThrow()
  })
})

describe('wentInactive', () => {
  it('is true active/null → off_market|sold', () => {
    expect(wentInactive('active', 'sold')).toBe(true)
    expect(wentInactive(null, 'off_market')).toBe(true)
  })
  it('is false otherwise', () => {
    expect(wentInactive('active', 'active')).toBe(false)
    expect(wentInactive('sold', 'sold')).toBe(false)
    expect(wentInactive('active', 'pending')).toBe(false)
  })
})
```

- [ ] **Step 3: Run test to verify it fails.** → FAIL.

- [ ] **Step 4: Write `scripts/agents/lib/market-check.ts`** and append db helpers.

`lib/db.ts` additions:

```ts
export async function updatePropertyMarketStatus(db: Db, propertyId: string, status: string): Promise<void> {
  const { error } = await db.from('properties')
    .update({ market_status: status, market_status_checked_at: new Date().toISOString() }).eq('id', propertyId)
  if (error) throw new Error(`updatePropertyMarketStatus failed: ${error.message}`)
}
export async function insertStatusHistory(db: Db, propertyId: string, status: string): Promise<void> {
  const { error } = await db.from('property_status_history')
    .insert({ property_id: propertyId, status, source: 'agent_market_check' })
  if (error) console.error(`insertStatusHistory failed: ${error.message}`)
}
export async function dismissRecommendations(db: Db, propertyId: string): Promise<void> {
  const { error } = await db.from('user_recommendations')
    .update({ recommended: false, dismissed_at: new Date().toISOString() }).eq('property_id', propertyId)
  if (error) console.error(`dismissRecommendations failed: ${error.message}`)
}
```

`lib/market-check.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { callClaude, extractJson } from './claude'
import { startRun, finishRun } from './run-log'
import { updatePropertyMarketStatus, insertStatusHistory, dismissRecommendations, type Db } from './db'

const SYSTEM = fs.readFileSync(path.join(import.meta.dirname, '..', 'prompts', 'market-check.md'), 'utf8')

export const marketCheckSchema = z.object({
  status: z.enum(['active', 'off_market', 'pending', 'sold', 'unknown']),
  price_current: z.number().nullable(),
  notes: z.string(),
})
export type MarketCheckOutput = z.infer<typeof marketCheckSchema>

export function buildMarketCheckPrompt(args: { address: string; city: string; state: string; zip: string; listing_url?: string | null }): string {
  const lines = [
    SYSTEM, '',
    `Check whether this property is still for sale: ${args.address}, ${args.city}, ${args.state} ${args.zip}`,
  ]
  if (args.listing_url) lines.push(`Listing URL: ${args.listing_url}`)
  lines.push('', `Respond with ONLY JSON: {"status":"active|off_market|pending|sold|unknown","price_current":number|null,"notes":str}`)
  return lines.join('\n')
}

export function parseMarketCheckOutput(raw: string): MarketCheckOutput {
  const parsed = extractJson(raw)
  if (!parsed) throw new Error('market-check: no JSON object in output')
  return marketCheckSchema.parse(parsed)
}

export function wentInactive(prev: string | null, next: string): boolean {
  const wasActive = prev === 'active' || prev == null
  return wasActive && (next === 'off_market' || next === 'sold')
}

export async function runMarketCheck(deps: {
  db: Db; property: { id: string; address: string; city: string; state: string; zip: string; market_status: string | null; raw_data: Record<string, unknown> | null }
}): Promise<{ status: string }> {
  const { db, property } = deps
  const runId = await startRun(db, 'market_check', 'auto', `Property ID: ${property.id}`)
  try {
    const listingUrl = (property.raw_data?.listing_url as string | undefined) ?? null
    const prompt = buildMarketCheckPrompt({ address: property.address, city: property.city, state: property.state, zip: property.zip, listing_url: listingUrl })
    const res = callClaude({ prompt, allowedTools: ['WebSearch', 'WebFetch'], timeoutMs: 120000 })
    if (res.rateLimited) throw Object.assign(new Error('rate-limited'), { rateLimited: true })
    if (!res.ok) throw new Error(res.error ?? 'market-check: claude call failed')
    const out = parseMarketCheckOutput(res.text)
    await updatePropertyMarketStatus(db, property.id, out.status)
    await insertStatusHistory(db, property.id, out.status)
    if (wentInactive(property.market_status, out.status)) await dismissRecommendations(db, property.id)
    await finishRun(db, runId, { status: 'success', output_summary: `Property ${property.address}: ${out.status} — ${out.notes}`.slice(0, 200) })
    return { status: out.status }
  } catch (e) {
    const rl = (e as { rateLimited?: boolean }).rateLimited === true
    await finishRun(db, runId, { status: rl ? 'timeout' : 'error', output_summary: String((e as Error).message ?? e).slice(0, 200) })
    throw e
  }
}
```

- [ ] **Step 5: Run test to verify it passes.** → PASS (5 tests).

- [ ] **Step 6: Commit.**

```bash
git add scripts/agents/prompts/market-check.md scripts/agents/lib/market-check.ts scripts/agents/lib/db.ts tests/agents/market-check.test.ts
git commit -m "feat(agents): market-check stage — status update, history, recommendation dismissal"
```

### Task 2.3: `prompts/tracker.md` + `lib/tracker.ts`

**Files:**
- Read first: `supabase/functions/agent-tracker/index.ts` (system 6–17, user 53–58, short-circuit + update 64–70)
- Create: `scripts/agents/prompts/tracker.md`, `scripts/agents/lib/tracker.ts`
- Test: `tests/agents/tracker.test.ts`
- Modify: `scripts/agents/lib/db.ts` (add `resolvedPredictions`, `updatePredictionAccuracy`)

**Interfaces:**
- Consumes: `trackerOutputSchema` from `@/schemas/tracker-output`.
- Produces:
  - `buildTrackerPrompt(args: { property; predictions; propertyId }): string` — pure.
  - `parseTrackerOutput(raw: string): TrackerOutput` — pure.
  - `runTracker(deps): Promise<{ tracked: number }>` — I/O shell; **short-circuits to a `success` run with no LLM call when there are zero predictions with `actual_value` set** (mirrors edge fn).

- [ ] **Step 1: Port the system prompt** — copy `TRACKER_SYSTEM_PROMPT` (lines 6–17) verbatim into `scripts/agents/prompts/tracker.md`.

- [ ] **Step 2: Write the failing test** `tests/agents/tracker.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseTrackerOutput } from '../../scripts/agents/lib/tracker'

const uuid = '22222222-2222-4222-8222-222222222222'
const sample = {
  property_id: uuid,
  comparisons: [{ metric: 'arv', predicted: 320000, actual: 330000, accuracy_pct: 97, assessment: 'close' }],
  overall_accuracy: 97, summary: 'accurate', recommendations: ['tighten reno est'],
}

describe('parseTrackerOutput', () => {
  it('validates via tracker Zod schema', () => {
    expect(parseTrackerOutput(JSON.stringify(sample)).overall_accuracy).toBe(97)
  })
  it('throws on overall_accuracy > 100', () => {
    expect(() => parseTrackerOutput(JSON.stringify({ ...sample, overall_accuracy: 150 }))).toThrow()
  })
})
```

- [ ] **Step 3: Run test to verify it fails.** → FAIL.

- [ ] **Step 4: Write the lib** and db helpers.

`lib/db.ts` additions:

```ts
export async function resolvedPredictions(db: Db, propertyId: string): Promise<Array<{ metric: string; predicted_value: number; actual_value: number }>> {
  const { data } = await db.from('property_predictions')
    .select('metric, predicted_value, actual_value').eq('property_id', propertyId).not('actual_value', 'is', null)
  return (data ?? []) as Array<{ metric: string; predicted_value: number; actual_value: number }>
}
export async function updatePredictionAccuracy(db: Db, propertyId: string, metric: string, accuracy: number): Promise<void> {
  const { error } = await db.from('property_predictions')
    .update({ accuracy_score: accuracy, resolved_at: new Date().toISOString() })
    .eq('property_id', propertyId).eq('metric', metric)
  if (error) console.error(`updatePredictionAccuracy failed: ${error.message}`)
}
```

`lib/tracker.ts`:

```ts
import fs from 'node:fs'
import path from 'node:path'
import { trackerOutputSchema, type TrackerOutput } from '@/schemas/tracker-output'
import { callClaude, extractJson } from './claude'
import { startRun, finishRun } from './run-log'
import { resolvedPredictions, updatePredictionAccuracy, type Db } from './db'

const SYSTEM = fs.readFileSync(path.join(import.meta.dirname, '..', 'prompts', 'tracker.md'), 'utf8')

export function buildTrackerPrompt(args: { property: Record<string, unknown>; predictions: unknown; propertyId: string }): string {
  return [
    SYSTEM, '',
    `Compare predicted vs actual for this property and score accuracy.`,
    `Property: ${JSON.stringify(args.property)}`,
    `Predictions (with actual_value set): ${JSON.stringify(args.predictions)}`,
    `property_id (echo exactly): ${args.propertyId}`,
    '',
    `Respond with ONLY JSON: {"property_id":"${args.propertyId}","comparisons":[{"metric":str,"predicted":num,"actual":num,"accuracy_pct":num,"assessment":str}],"overall_accuracy":num(0-100),"summary":str,"recommendations":[str]}`,
  ].join('\n')
}

export function parseTrackerOutput(raw: string): TrackerOutput {
  const parsed = extractJson(raw)
  if (!parsed) throw new Error('tracker: no JSON object in output')
  return trackerOutputSchema.parse(parsed)
}

export async function runTracker(deps: {
  db: Db; property: { id: string; address: string }
}): Promise<{ tracked: number }> {
  const { db, property } = deps
  const runId = await startRun(db, 'tracker', 'auto', `Property: ${property.address}`)
  try {
    const preds = await resolvedPredictions(db, property.id)
    if (preds.length === 0) {
      await finishRun(db, runId, { status: 'success', output_summary: 'No resolved predictions to track' })
      return { tracked: 0 }
    }
    const prompt = buildTrackerPrompt({ property, predictions: preds, propertyId: property.id })
    const res = callClaude({ prompt, timeoutMs: 120000 })
    if (res.rateLimited) throw Object.assign(new Error('rate-limited'), { rateLimited: true })
    if (!res.ok) throw new Error(res.error ?? 'tracker: claude call failed')
    const out = parseTrackerOutput(res.text)
    for (const c of out.comparisons) await updatePredictionAccuracy(db, property.id, c.metric, c.accuracy_pct)
    await finishRun(db, runId, { status: 'success', output_summary: `Tracked ${out.comparisons.length} predictions, ${out.overall_accuracy}% accuracy` })
    return { tracked: out.comparisons.length }
  } catch (e) {
    const rl = (e as { rateLimited?: boolean }).rateLimited === true
    await finishRun(db, runId, { status: rl ? 'timeout' : 'error', output_summary: String((e as Error).message ?? e).slice(0, 200) })
    throw e
  }
}
```

- [ ] **Step 5: Run test to verify it passes.** → PASS (2 tests).

- [ ] **Step 6: Commit.**

```bash
git add scripts/agents/prompts/tracker.md scripts/agents/lib/tracker.ts scripts/agents/lib/db.ts tests/agents/tracker.test.ts
git commit -m "feat(agents): tracker stage — accuracy scoring with no-resolved short-circuit"
```

### Task 2.4: `lib/orchestrate.ts` — filter, criteria merge, recommendation gate, stale flagging

**Files:**
- Read first: `agent-autoscout/index.ts` (mergeCriteria + passesFilter 41–87), `agent-orchestrator/index.ts` (recommendation gate 75–83, stale 149–179)
- Create: `scripts/agents/lib/orchestrate.ts`
- Test: `tests/agents/orchestrate.test.ts`
- Modify: `scripts/agents/lib/db.ts` (add `upsertRecommendation`, `flagStaleProperties`, `clearStaleForAdvanced`)

**Interfaces:**
- Produces (pure):
  - `mergeCriteria(global, overrides): MergedCriteria`
  - `passesFilter(prop, criteria): boolean` — mirrors autoscout's filter over `max_price/min_cap_rate/min_flip_roi/min_score/property_types/strategies` reading from `raw_data`.
  - `shouldRecommend(marketStatus: string, confidence: number | null): boolean` — `marketStatus==='active' && (confidence ?? 0) >= 50`.
- Produces (I/O): `upsertRecommendation(db, userId, propertyId)`, `flagStale(db)`.

- [ ] **Step 1: Write the failing test** `tests/agents/orchestrate.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { mergeCriteria, passesFilter, shouldRecommend } from '../../scripts/agents/lib/orchestrate'

describe('mergeCriteria', () => {
  it('overrides win over global', () => {
    const m = mergeCriteria({ max_price: 300000, min_score: 60, property_types: ['single_family'], strategies: ['flip'] }, { max_price: 250000 })
    expect(m.max_price).toBe(250000); expect(m.min_score).toBe(60)
  })
})

describe('passesFilter', () => {
  const crit = { max_price: 300000, min_cap_rate: 6, min_flip_roi: 10, min_score: 70, property_types: ['single_family'], strategies: ['flip', 'either'] }
  it('passes a compliant property', () => {
    expect(passesFilter({ list_price: 250000, property_type: 'single_family', raw_data: { score: 82, recommended_strategy: 'flip', estimated_cap_rate: 7, estimated_flip_roi: 12 } }, crit)).toBe(true)
  })
  it('fails on price over max', () => {
    expect(passesFilter({ list_price: 350000, property_type: 'single_family', raw_data: { score: 82, recommended_strategy: 'flip' } }, crit)).toBe(false)
  })
  it('fails on score under min', () => {
    expect(passesFilter({ list_price: 250000, property_type: 'single_family', raw_data: { score: 50, recommended_strategy: 'flip' } }, crit)).toBe(false)
  })
  it('fails on wrong property_type', () => {
    expect(passesFilter({ list_price: 250000, property_type: 'condo', raw_data: { score: 82, recommended_strategy: 'flip' } }, crit)).toBe(false)
  })
})

describe('shouldRecommend', () => {
  it('recommends active + confidence>=50', () => {
    expect(shouldRecommend('active', 68)).toBe(true)
    expect(shouldRecommend('active', 40)).toBe(false)
    expect(shouldRecommend('sold', 90)).toBe(false)
    expect(shouldRecommend('active', null)).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails.** → FAIL.

- [ ] **Step 3: Write `scripts/agents/lib/orchestrate.ts`** (port `passesFilter`/`mergeCriteria` logic faithfully — read the edge source to match every condition, including how each criterion tolerates missing `raw_data` fields) and append db helpers `upsertRecommendation` (onConflict `user_id,property_id`, `{recommended:true, dismissed_at:null}`) and `flagStale` (the two UPDATE statements from orchestrator 149–179). Implement `shouldRecommend` exactly as `market active && confidence>=50`.

- [ ] **Step 4: Run test to verify it passes.** → PASS (7 tests).

- [ ] **Step 5: Commit.**

```bash
git add scripts/agents/lib/orchestrate.ts scripts/agents/lib/db.ts tests/agents/orchestrate.test.ts
git commit -m "feat(agents): orchestration — criteria filter, recommendation gate, stale flagging"
```

### Task 2.5: Wire the full pipeline into `run-nightly.ts`

**Files:**
- Modify: `scripts/agents/run-nightly.ts` (fill the Phase-2 seam)

**Interfaces:**
- Consumes: `runAnalyst`, `runMarketCheck`, `runTracker`, orchestration helpers, caps.

- [ ] **Step 1: Read `run-nightly.ts`** (it was created in Task 1.7 — read before editing).

- [ ] **Step 2: Replace the Phase-2 seam comment** with the orchestration loop:
  - After scout, for each user with newly-scouted properties (respecting `passesFilter` against merged criteria): collect candidate property IDs.
  - For each candidate up to `CAPS.analyst`: skip if `raw_data.score < auto_analyze_min_score` (default 60); if `!hasAnalysis`, `runAnalyst`; `runMarketCheck`; then if `shouldRecommend(marketStatus, latestAnalysisConfidence)` → `upsertRecommendation(user_id, property_id)`.
  - Run `flagStale(db)` once.
  - Market-check rotation: also select up to `CAPS.marks` **existing open properties** (e.g. `market_status='active'` ordered by `market_status_checked_at` ascending / nulls first) and `runMarketCheck` them (this is the weekly mark rotation; it is safe to run nightly with the cap). Real-world `sold` closes handled here.
  - Tracker: for properties that now have resolved predictions, `runTracker` (bounded by the same candidate set).
  - Wrap each stage call so a `rateLimited` error triggers the quiet-night early `return 0`; other errors are logged per-property and do not abort the night.
  - Emit a final one-line summary: `scouted N, analyzed M, marked K, recommended R`.

- [ ] **Step 3: Add a focused test** for any new pure helper introduced (e.g. `selectMarkRotation(props, cap)` if added) in `tests/agents/run-nightly.test.ts`, following the existing pattern. If no new pure helper is added, skip (the loop is I/O, proven in Step 5).

- [ ] **Step 4: Type-check + unit suite green.**
Run: `cd /c/tmp/turnkey-nightly-agents && npx vitest run tests/agents/`
Expected: all agent tests PASS.

- [ ] **Step 5: Full dry-run.**
Run: `cd /c/tmp/turnkey-nightly-agents && npx tsx scripts/agents/run-nightly.ts --dry-run`
Expected: header, scout/analyst/market-check/tracker dry-run lines, final summary, exit 0, no writes.

- [ ] **Step 6: Commit.**

```bash
git add scripts/agents/run-nightly.ts tests/agents/run-nightly.test.ts
git commit -m "feat(agents): wire full nightly pipeline (scout→analyst→market-check→recommend→stale→tracker)"
```

### Task 2.6: Live full-pipeline verification (zero UI change, $0 gateway)

- [ ] **Step 1: Run a real full nightly** (real `.env`, active watchlists present):
Run: `cd /c/tmp/turnkey-nightly-agents && npx tsx scripts/agents/run-nightly.ts`
Expected: completes; summary line; exit 0.

- [ ] **Step 2: Prove the DB contract + $0 spend.** Via Supabase MCP (or an admin-client tsx snippet that prints only aggregates, never the key), assert for rows created in the last hour:
  - `agent_runs`: every row has `cost_est = 0` and `model = 'claude-code-subscription'`; `agent_type` ∈ {scout, analyst, market_check, tracker}; statuses success/timeout only (no unexpected error storm).
  - `property_analyses`: new rows with `rental_monthly_est`, `confidence_score`, `analysis_summary`, `neighborhood_data` populated.
  - `property_predictions`: 3 new rows per analyzed property (arv/rental_income/renovation_cost).
  - `user_recommendations`: rows where an analyzed active property scored ≥50 confidence.
  - **$0 gateway proof:** the dashboard's AI-spend KPI queries `agent_runs.cost_est` sum for the month — the nightly rows contribute 0. Confirm the LLM Gateway / Vercel AI Gateway usage did not increase (no calls were made to `ai-gateway.vercel.sh` by the harness — it only spawns `claude -p`).

- [ ] **Step 3: Prove zero UI change.** `git status` shows nothing under `src/`. Load the app (`npm run dev`) or inspect the built pages: dashboard `/`, scout `/scout`, predictions `/predictions` render the fresh nightly data through their existing hooks with no code change. Confirm `git diff --stat master -- src/` is empty.

- [ ] **Step 4: Run the full repo test suite** to ensure no regressions:
Run: `cd /c/tmp/turnkey-nightly-agents && npm test`
Expected: existing `tests/schemas/*` + `tests/hooks/*` + new `tests/agents/*` all PASS.

### Task 2.7: Cutover — unschedule `autoscout-daily` (operator) + doc migration 00008

**Files:**
- Create: `supabase/migrations/00008_autoscout_unschedule.sql`
- Create: `.planning/walkthroughs/2026-07-17-turnkey-cutover.html` (operator ask)

**Interfaces:**
- Produces: the documented cutover SQL + an operator handoff to run it in the live SQL Editor (house rule: no `db push` to shared; Dashboard SQL). **Only run the unschedule AFTER Task 2.6 proves the harness works.**

- [ ] **Step 1: Write `supabase/migrations/00008_autoscout_unschedule.sql`:**

```sql
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
```

- [ ] **Step 2: Write the cutover walkthrough** `.planning/walkthroughs/2026-07-17-turnkey-cutover.html` — an Operator Console-style ask with: (a) a copy button for `SELECT cron.unschedule('autoscout-daily');`; (b) a deep-link button to the SQL Editor `https://supabase.com/dashboard/project/xebulbfhwyezjrqobzow/sql/new`; (c) the verify query `SELECT jobname FROM cron.job WHERE jobname = 'autoscout-daily';` (expect zero rows); (d) a plain statement of what stays (weekly-digest, enricher, all edge functions as fallback) and why (subscription cutover). Single-line PowerShell-clean commands, one fenced block per step, per house `feedback_command_format_for_user.md`.

- [ ] **Step 3: Commit.**

```bash
git add supabase/migrations/00008_autoscout_unschedule.sql ".planning/walkthroughs/2026-07-17-turnkey-cutover.html"
git commit -m "feat(agents): cutover — doc migration 00008 + operator unschedule walkthrough"
```

- [ ] **Step 4: Operator handoff (human).** Surface the cutover walkthrough to Shawn. He runs the unschedule in the SQL Editor and confirms zero rows. **Do not run it yourself** (live shared prod DB; Tier-2). Record confirmation in the PR description.

### Task 2.8: Finish the branch — PR

- [ ] **Step 1:** Ensure everything is committed and the worktree is clean (`git status`).
- [ ] **Step 2:** Rebase onto fresh origin/master and push the branch (never `master`):

```bash
cd /c/tmp/turnkey-nightly-agents
git fetch origin master
git rebase origin/master
git push -u origin feat/turnkey-nightly-agents
```

- [ ] **Step 3:** Open a PR with `gh pr create` summarizing: the subscription cutover (scout/analyst/market-check/tracker now via `claude -p`), $0 gateway spend proof, zero-UI-change proof, the kept edge-function fallback, the schtasks registration, the Phase-0 secret hygiene + rotation note, and the two operator asks (env hygiene, cron unschedule) with their status. Follow the superpowers:finishing-a-development-branch skill for the completion options.

**Phase 2 complete when:** full nightly populates the UI with zero `src/` changes and $0 gateway spend; `autoscout-daily` unscheduled (operator-confirmed) with migration 00008 documenting it; weekly-digest + enricher + all edge functions retained as fallback; branch landed via PR.

---

## Self-Review (author checklist — completed against the spec)

**Spec coverage (WS3 Phases 0–2, plan lines 119–146):**
- Deterministic TS harness owns all DB writes → `lib/db.ts` + service-role client (Task 1.3). ✓
- `claude -p` per stage, cred-free, data-in/JSON-out → `lib/claude.ts` (Task 1.2), each stage shell. ✓
- scout/market-check get `--allowedTools "WebSearch,WebFetch"`; analyst/tracker none → encoded in each `runX`. ✓
- Zod contracts from `src/schemas/*` validate before writes → scout/analyst/tracker use the repo schemas; market-check adds an inline schema (no repo file exists) — noted. ✓
- Spawn mirrors `intention.mjs` (stdin, shell:true, extractJson, graceful fallback, rate-limit→quiet-night exit 0) → Task 1.2 + kill/quiet-night in run-nightly. ✓
- `scripts/agents/` layout with `run-nightly.ts` + `lib/{db,claude,run-log,scout}` (+ analyst/market-check/tracker in P2) + `prompts/*.md` → File Structure. ✓
- `agent_runs` every stage with `cost_est:0`, `model:'claude-code-subscription'` → `run-log.ts` (Task 1.4). ✓
- Nightly caps (≤3 watchlists, ≤10 analyst, ≤15 marks) → `CAPS` (Task 1.7) applied in orchestration (Task 2.5). ✓
- `run-nightly.bat` via schtasks 02:30 daily → Task 1.8. ✓
- Phase 0: move BLS/Census/FRED to `.env` (value-free) + rotation note → Tasks 0.1–0.3. ✓
- Phase 1 verify: `--stage=scout` lands `source='autoscout'` visible in Scout page + one unattended run → Tasks 1.8–1.9 (with source-visibility halt gate). ✓
- Phase 2: port analyst+market-check+tracker + cutover (`cron.unschedule('autoscout-daily')` + doc migration 00008); keep weekly-digest + enricher + edge functions → Tasks 2.1–2.7. ✓
- Phase 2 verify: full nightly populates UI, zero UI changes, $0 gateway → Task 2.6. ✓
- House rules (worktree, read-before-edit, secrets from .env, never push master, land via PR) → Global Constraints + Task 2.8. ✓

**Deviations flagged for the executor / Shawn:**
1. **00007 gap:** cutover migration is `00008`; `00007` reserved for the Phase-3 simulation layer per plan. Documented in the migration header.
2. **Source visibility:** nightly writes `source='autoscout'` (per plan) but the Scout page list filters `source='agent_scout'`. Task 1.9 is a halt/decide gate — the deployed autoscout already behaves this way, so default is to keep `autoscout` and surface via map/recommended, but confirm with Shawn.
3. **`scout_day` ignored:** the nightly harness takes up to `CAPS.watchlists` active watchlists regardless of `scout_day` (autoscout used day-of-week staggering). Documented in Task 1.7 / README.
4. **market-check has no `src/schemas` file:** an inline `marketCheckSchema` is defined in the lib to honor "validate every output."
5. **Two operator asks** (env hygiene, cron unschedule) and the **schtasks registration** are machine/prod-state changes handed off per house rules — not silently executed by the harness.

**Placeholder scan:** no TBD/"add error handling"/"similar to Task N" — every code step carries full code or a precise verbatim-port instruction with file:line. ✓
**Type consistency:** `PropertyRow`, `AnalysisRow`, `PredictionRow`, `Db`, `ClaudeResult`, `SUBSCRIPTION_MODEL`, `CAPS` names are consistent across tasks. ✓
