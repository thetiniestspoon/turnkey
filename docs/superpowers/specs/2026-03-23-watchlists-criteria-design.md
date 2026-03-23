# Turnkey Watchlists + Investment Criteria — Design Specification

**Project:** Turnkey — Proactive Deal Discovery
**Author:** Shawn + Claude
**Date:** 2026-03-23
**Status:** Approved
**Parent Spec:** `docs/superpowers/specs/2026-03-23-turnkey-design.md`

---

## 1. Overview

Add watchlists and investment criteria to Turnkey so the system proactively scouts Ted's target markets overnight and surfaces deals that match his investment thesis — without Ted having to manually trigger scouts.

### What's Changing

- Ted saves a list of watched markets (ZIPs) with optional per-market criteria overrides
- Ted defines global investment criteria (max price, min cap rate, min flip ROI, etc.)
- A scheduled Edge Function runs nightly, scouting all active watchlists and filtering results against criteria
- Dashboard and Scout page show "New" badges on properties scouted in the last 24 hours

---

## 2. Data Model

### New Table: `watchlists`

```sql
watchlists
├── id uuid PK
├── user_id uuid FK → auth.users
├── name text NOT NULL (e.g. "NJ Suburbs", "Austin Metro")
├── zip text NOT NULL
├── city text
├── state text (2-char)
├── criteria_overrides jsonb DEFAULT NULL
│   (same shape as investment_criteria fields — any field present overrides global default)
├── active boolean DEFAULT true
├── last_scouted_at timestamptz
├── created_at timestamptz DEFAULT now()
└── updated_at timestamptz DEFAULT now()
```

RLS: Users see/manage own watchlists (`auth.uid() = user_id`).

### New Table: `investment_criteria`

```sql
investment_criteria
├── id uuid PK
├── user_id uuid FK → auth.users (UNIQUE — one row per user)
├── max_price numeric
├── min_cap_rate numeric
├── min_flip_roi numeric
├── property_types text[] DEFAULT '{single_family,multi_family,condo,townhouse}'
├── min_score int DEFAULT 60
├── strategies text[] DEFAULT '{flip,rental,either}'
├── created_at timestamptz DEFAULT now()
└── updated_at timestamptz DEFAULT now()
```

RLS: Users see/manage own criteria (`auth.uid() = user_id`).

### Modified: `properties.raw_data`

No schema change — the `raw_data` jsonb already contains `scouted_at` (added in the Scout agent update). Autoscout properties will have `source: 'autoscout'` to distinguish them from manual scouts.

### Criteria Override Logic

When processing a watchlist entry, merge global criteria with per-market overrides:

```
mergedCriteria = { ...globalCriteria, ...watchlist.criteria_overrides }
```

Fields present in `criteria_overrides` replace the global default. Missing fields fall through to the global value.

---

## 3. Autoscout Edge Function

### New: `supabase/functions/agent-autoscout/index.ts`

**Trigger:** pg_cron job at 5:00 AM ET daily via `net.http_post`.

**Flow:**
1. Fetch all active watchlists (across all users)
2. For each watchlist:
   a. Fetch the user's global `investment_criteria`
   b. Merge with `watchlist.criteria_overrides`
   c. Call the existing Scout agent (Anthropic Messages API with web search) for the watchlist ZIP
   d. Filter returned properties against merged criteria
   e. Save passing properties to `properties` table with `source: 'autoscout'`
   f. Update `watchlist.last_scouted_at`
   g. Log to `agent_runs` with `trigger: 'cron'`
3. If any individual watchlist fails, log error, continue to next

**Criteria Filter (applied after Scout returns results):**
```
SKIP IF property.list_price > criteria.max_price
SKIP IF property.estimated_cap_rate < criteria.min_cap_rate
SKIP IF property.estimated_flip_roi < criteria.min_flip_roi
SKIP IF property.score < criteria.min_score
SKIP IF property.property_type NOT IN criteria.property_types
SKIP IF property.recommended_strategy NOT IN criteria.strategies
```

Properties that pass all filters get saved. Properties that fail are discarded (not saved to DB).

### pg_cron Setup

```sql
SELECT cron.schedule(
  'nightly-autoscout',
  '0 10 * * *',  -- 10:00 UTC = 5:00 AM ET
  $$SELECT net.http_post(
    url := current_setting('app.supabase_url') || '/functions/v1/agent-autoscout',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )$$
);
```

Note: `pg_cron` and `pg_net` extensions must be enabled in Supabase dashboard.

---

## 4. Frontend

### New Page: Watchlists (`/watchlists`)

**Layout:**
- Header: "Watchlists" + "Add Market" button
- Global criteria section (collapsible, shows current defaults with edit capability)
- Table of watched markets:
  - Columns: Name, ZIP, City/State, Last Scouted, Active (toggle), Actions
  - Actions: Edit Criteria (dialog), Scout Now (manual trigger), Delete
- "Add Market" dialog: name, ZIP, optional city/state, optional criteria overrides

**Global Criteria Form (section on watchlists page):**
- Max Price (currency input)
- Min Cap Rate (% input)
- Min Flip ROI (% input)
- Property Types (multi-select checkboxes)
- Min Score (slider or number, 0-100)
- Strategies (multi-select: flip, rental, either)
- Save button → upserts to `investment_criteria`

**Per-Market Override Dialog:**
- Same fields as global criteria
- Placeholder text shows the current global default for each field
- Empty fields = use global default
- Save button → updates `watchlist.criteria_overrides` jsonb

### Modified: Dashboard

- "New Deals Today" KPI card counts properties with `raw_data.scouted_at` in last 24 hours
- Top Deals list shows "New" badge (green) on properties scouted in last 24 hours

### Modified: Scout Page

- Deal cards show "New" badge on properties with `raw_data.scouted_at` in last 24 hours
- No other changes — manual scouting still works as before

### New Nav Item

Add "Watchlists" to the nav bar between "Predictions" and the Advisor button.

### New Hooks

- `useWatchlists()` — CRUD for watchlists, manual scout trigger
- `useCriteria()` — Read/upsert global investment criteria

---

## 5. Error Handling

- **Individual watchlist failure:** Log error to `agent_runs`, skip to next. Don't block other markets.
- **No results pass criteria:** Update `last_scouted_at` anyway. Ted sees "0 new deals."
- **Duplicate properties:** Upsert on `(address, city, state)` deduplicates across markets.
- **pg_cron auth:** Uses service role key in the HTTP header for full DB write access.
- **Rate awareness:** Each scout uses up to 5 Anthropic web searches. With 20 watched markets = ~100 searches/night. Acceptable. If watchlist grows beyond 50, consider batching across multiple nights.

---

## 6. Testing

- **Criteria merge logic:** Unit test — global + override merge, missing fields fall through
- **Criteria filter logic:** Unit test — property passes/fails against various criteria combinations
- **Watchlist CRUD:** Hook tests following existing patterns
- **"New" badge:** Verify 24-hour window with timezone handling
- **Autoscout flow:** Integration test — mock Scout response, verify filter + save + log

---

## 7. Scope Boundaries

### In Scope
- Watchlist CRUD (add, edit, delete, toggle active)
- Global investment criteria with per-market overrides
- Autoscout Edge Function with criteria filtering
- pg_cron nightly schedule
- "New" badge on Dashboard and Scout page
- Manual "Scout Now" per watchlist entry

### Out of Scope (Future)
- Email notifications / digest
- Market Radar (automatic market detection from macro signals)
- Pattern learning from pipeline history
- Configurable schedule per watchlist (daily vs weekly)
- Bulk import of watchlist ZIPs
