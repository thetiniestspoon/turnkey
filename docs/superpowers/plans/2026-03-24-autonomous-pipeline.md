# Autonomous Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Turnkey's agent system work autonomously — scout surfaces properties, analyst auto-evaluates them, properties are flagged as "ones to watch", market status is verified, stale items are flagged, and a weekly email digest is sent.

**Architecture:** Autoscout runs on a staggered daily rotation (2-3 watchlists/day, each watchlist scouted ~once/week). After scout saves properties, an orchestrator function triggers auto-analyst on properties above the user's score cutoff. A market-checker agent verifies listings are still active. Properties passing all checks get a row in `user_recommendations` (per-user). A weekly digest function queries the week's activity and emails a summary via Resend (free tier: 100 emails/day). Stale flagging runs daily in the orchestrator using `entered_stage_at` for accuracy.

**Tech Stack:** Supabase Edge Functions (Deno), PostgreSQL migrations, pg_cron + pg_net, Resend email API (free tier), React/TypeScript frontend

---

## File Map

### Database
- **Create:** `supabase/migrations/00003_autonomous_pipeline.sql` — new columns, tables, indexes

### Edge Functions (Backend)
- **Modify:** `supabase/functions/agent-autoscout/index.ts` — staggered rotation, trigger orchestrator
- **Create:** `supabase/functions/agent-market-check/index.ts` — verifies if properties are still on market
- **Create:** `supabase/functions/agent-orchestrator/index.ts` — coordinates auto-analyst + market check after scout
- **Create:** `supabase/functions/agent-digest/index.ts` — generates + emails weekly summary

### Frontend
- **Modify:** `src/hooks/use-criteria.ts` — add `auto_analyze_min_score` field
- **Create:** `src/hooks/use-recommended.ts` — hook for recommended properties with quick pipeline toggle
- **Modify:** `src/pages/watchlists.tsx` — add auto-analyze score cutoff to criteria form
- **Modify:** `src/pages/dashboard.tsx` — add "Ones to Watch" section
- **Create:** `src/components/dashboard/recommended-deals.tsx` — recommended deals widget with toggle-to-watching
- **Modify:** `src/components/property/deal-card-mini.tsx` — show market status badge + stale indicator

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/00003_autonomous_pipeline.sql`

- [ ] **Step 1: Write migration**

```sql
-- 1. Add auto_analyze_min_score to investment_criteria
ALTER TABLE investment_criteria ADD COLUMN auto_analyze_min_score int DEFAULT 60;

-- 2. Add autonomous columns to properties
ALTER TABLE properties ADD COLUMN market_status text DEFAULT 'active'
  CHECK (market_status IN ('active', 'off_market', 'pending', 'sold', 'unknown'));
ALTER TABLE properties ADD COLUMN market_status_checked_at timestamptz;
ALTER TABLE properties ADD COLUMN stale_at timestamptz;

-- 3. Allow 'autoscout' as a source
ALTER TABLE properties DROP CONSTRAINT IF EXISTS properties_source_check;
ALTER TABLE properties ADD CONSTRAINT properties_source_check
  CHECK (source IN ('zillow', 'census', 'manual', 'agent_scout', 'autoscout'));

-- 4. Per-user recommendations (not a boolean on shared properties table)
CREATE TABLE user_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  recommended boolean DEFAULT true,
  dismissed_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, property_id)
);
CREATE INDEX idx_recommendations_active ON user_recommendations(user_id)
  WHERE recommended = true AND dismissed_at IS NULL;

-- 5. Property status history (track on/off market over time)
CREATE TABLE property_status_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('active', 'off_market', 'pending', 'sold', 'unknown')),
  checked_at timestamptz DEFAULT now(),
  source text -- 'agent_market_check', 'manual'
);
CREATE INDEX idx_status_history_property ON property_status_history(property_id, checked_at DESC);

-- 6. Add new agent types to agent_runs + user_id column
ALTER TABLE agent_runs DROP CONSTRAINT IF EXISTS agent_runs_agent_type_check;
ALTER TABLE agent_runs ADD CONSTRAINT agent_runs_agent_type_check
  CHECK (agent_type IN ('scout', 'analyst', 'tracker', 'advisor', 'enricher', 'autoscout', 'orchestrator', 'market_check', 'digest'));
ALTER TABLE agent_runs ADD COLUMN user_id uuid REFERENCES auth.users(id);

-- 7. Staggered autoscout schedule column on watchlists
ALTER TABLE watchlists ADD COLUMN scout_day int DEFAULT 0
  CHECK (scout_day BETWEEN 0 AND 6); -- 0=Sunday, 6=Saturday

-- 8. Indexes for dashboard queries
CREATE INDEX idx_properties_market_status ON properties(market_status);
CREATE INDEX idx_properties_stale ON properties(stale_at) WHERE stale_at IS NOT NULL;

-- 9. RLS for new tables
ALTER TABLE user_recommendations ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_own_recommendations ON user_recommendations FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

ALTER TABLE property_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY read_status_history ON property_status_history FOR SELECT TO authenticated USING (true);
```

- [ ] **Step 2: Push migration**

Run: `npx supabase db push`
Expected: Migration applied successfully

- [ ] **Step 3: Assign stagger days to existing watchlists**

```sql
WITH numbered AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) - 1 AS rn
  FROM watchlists WHERE active = true
)
UPDATE watchlists SET scout_day = numbered.rn % 7
FROM numbered WHERE watchlists.id = numbered.id;
```

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/00003_autonomous_pipeline.sql
git commit -m "feat: add autonomous pipeline schema — recommendations, market_status, stagger days"
```

---

## Task 2: Market Check Agent

**Files:**
- Create: `supabase/functions/agent-market-check/index.ts`

**Note:** This is sequenced BEFORE the orchestrator (Task 3) because the orchestrator depends on it.

- [ ] **Step 1: Create market check function**

Uses Claude Sonnet 4.6 with web_search tool (Anthropic Messages API, same pattern as agent-scout) to verify if a property is still listed for sale.

Input: `{ property_id: string }`

Logic:
1. Fetch property from DB (address, city, state, zip, `raw_data->>'listing_url'`)
2. Call Claude with web_search (max 2 searches):
   - If `listing_url` exists: search for that URL
   - Otherwise: search `"{address}" {city} {state} for sale`
3. Claude returns JSON: `{ "status": "active|off_market|pending|sold|unknown", "price_current": number|null, "notes": "string" }`
4. Update `properties.market_status` and `properties.market_status_checked_at`
5. Insert row into `property_status_history`
6. If status changed from active → off_market/sold, also dismiss any `user_recommendations` for this property
7. Log to `agent_runs` with `agent_type: 'market_check'`

Return: `{ status, price_current, notes, changed: boolean }`

System prompt should be small — instruct Claude to check one specific property listing and determine its current market status. Keep `max_tokens: 1024` and `max_uses: 2` for web search to control costs.

- [ ] **Step 2: Deploy**

Run: `npx supabase functions deploy agent-market-check --no-verify-jwt`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/agent-market-check/index.ts
git commit -m "feat: add market-check agent — verify listings still active, track history"
```

---

## Task 3: Orchestrator Function

**Files:**
- Create: `supabase/functions/agent-orchestrator/index.ts`

**Prerequisites:** Task 2 (market-check agent) must be deployed first.

- [ ] **Step 1: Create orchestrator**

Input: `{ property_ids: string[], user_id: string }`

For each property (with try/catch per property for error isolation):

1. Fetch property from DB, extract score from `(raw_data->>'score')::int`
2. Fetch user's `auto_analyze_min_score` from `investment_criteria` (default 60 if not set)
3. If score >= cutoff AND no existing row in `property_analyses` for this property_id:
   - Call `agent-analyst` via internal HTTP (`SUPABASE_URL/functions/v1/agent-analyst`)
4. Call `agent-market-check` via internal HTTP
5. If market_status = 'active' AND (analysis exists with confidence_score >= 50):
   - Upsert into `user_recommendations` with `recommended = true, dismissed_at = null`
6. Log run to `agent_runs` with `agent_type: 'orchestrator', user_id`

**Concurrency:** Process properties in batches of 3 using `Promise.allSettled` to stay within Edge Function timeout (150s on Pro, 60s on Free). Each property takes ~15-20s (analyst ~10s + market-check ~5-10s).

**Stale flagging (runs every orchestrator invocation):**
```sql
UPDATE properties SET stale_at = now()
FROM pipeline
WHERE pipeline.property_id = properties.id
  AND pipeline.entered_stage_at < now() - interval '30 days'
  AND pipeline.stage IN ('watching', 'analyzing')
  AND properties.stale_at IS NULL;
```

Also clear stale when a user has advanced the stage:
```sql
UPDATE properties SET stale_at = NULL
FROM pipeline
WHERE pipeline.property_id = properties.id
  AND pipeline.stage NOT IN ('watching', 'analyzing')
  AND properties.stale_at IS NOT NULL;
```

- [ ] **Step 2: Deploy**

Run: `npx supabase functions deploy agent-orchestrator --no-verify-jwt`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/agent-orchestrator/index.ts
git commit -m "feat: add orchestrator — auto-analyze, market-check, recommend, stale-flag"
```

---

## Task 4: Staggered Autoscout

**Files:**
- Modify: `supabase/functions/agent-autoscout/index.ts`

- [ ] **Step 1: Modify autoscout to only scout today's watchlists and trigger orchestrator**

Key changes to existing autoscout:
1. Add `.eq('scout_day', new Date().getDay())` to the watchlist query
2. Collect all newly-saved property IDs per user across the scouted watchlists
3. After all watchlists are processed, call `agent-orchestrator` with `{ property_ids, user_id }` per user
4. Add `listing_url` and `image_url` to the property upsert `raw_data` (pass through from scout results)

- [ ] **Step 2: Deploy**

Run: `npx supabase functions deploy agent-autoscout --no-verify-jwt`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/agent-autoscout/index.ts
git commit -m "feat: stagger autoscout by day-of-week, trigger orchestrator downstream"
```

---

## Task 5: Weekly Digest Agent

**Files:**
- Create: `supabase/functions/agent-digest/index.ts`

- [ ] **Step 1: Create digest function**

Queries the past 7 days of activity and generates + sends an HTML email summary.

**Data gathered via SQL:**
- New properties scouted this week: `SELECT COUNT(*), zip FROM properties WHERE created_at > now() - interval '7 days' GROUP BY zip`
- Newly recommended: `SELECT * FROM user_recommendations JOIN properties ... WHERE created_at > now() - interval '7 days' AND recommended = true`
- Gone off-market: `SELECT * FROM property_status_history WHERE status IN ('off_market', 'sold') AND checked_at > now() - interval '7 days'`
- Stale properties: `SELECT * FROM properties WHERE stale_at IS NOT NULL`
- Top 3 highest-scored new properties with details
- Agent run stats: `SELECT agent_type, COUNT(*), SUM(cost_est) FROM agent_runs WHERE started_at > now() - interval '7 days' GROUP BY agent_type`

**Email delivery via Resend (free tier: 100 emails/day):**
```typescript
await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${Deno.env.get('RESEND_API_KEY')}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from: 'Turnkey <digest@turnkey-rosy.vercel.app>',
    to: [userEmail],
    subject: `Turnkey Weekly — ${newCount} new properties, ${recCount} recommended`,
    html: digestHtml,
  }),
})
```

Requires: `npx supabase secrets set RESEND_API_KEY=<key>` (sign up at resend.com, free).

Format the HTML as a clean dashboard-style email:
- Header with date range
- "Ones to Watch" section with top recommended properties (address, price, score, strategy)
- "Market Movements" section (properties that went off-market or changed price)
- "Stale Alerts" section (pipeline items with no action in 30+ days)
- "Agent Activity" footer (run counts and total cost)

- [ ] **Step 2: Deploy**

Run: `npx supabase functions deploy agent-digest --no-verify-jwt`

- [ ] **Step 3: Commit**

```bash
git add supabase/functions/agent-digest/index.ts
git commit -m "feat: add weekly digest agent — email summary via Resend"
```

---

## Task 6: pg_cron Schedules

**Prerequisites:** Enable `pg_cron` and `pg_net` extensions in Supabase Dashboard → Database → Extensions. Both must be enabled for scheduled HTTP calls to work.

- [ ] **Step 1: Set up cron jobs**

Run via `supabase db query --linked`:

```sql
-- Autoscout: runs daily at 6 AM ET (11 AM UTC), only scouts that day's watchlists
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
```

**IMPORTANT:** Replace `SERVICE_ROLE_KEY_HERE` with actual service role key. This is stored in the cron job table in the DB. Alternatively, since functions are deployed with `--no-verify-jwt`, the Authorization header can use the anon key or be omitted entirely.

- [ ] **Step 2: Verify cron jobs**

```sql
SELECT jobname, schedule, command FROM cron.job;
```

---

## Task 7: Frontend — Auto-Analyze Score Cutoff Setting

**Files:**
- Modify: `src/hooks/use-criteria.ts`
- Modify: `src/pages/watchlists.tsx`

- [ ] **Step 1: Add auto_analyze_min_score to criteria hook**

Add `auto_analyze_min_score: number | null` to the `InvestmentCriteria` interface. Include it in the `saveCriteria` values type.

- [ ] **Step 2: Add score cutoff input to watchlists criteria form**

In the Global Investment Criteria card on the Watchlists page, add a new input field:
- Label: "Auto-Analyze Cutoff"
- Type: number, min 0, max 100
- Placeholder: "60"
- Helper text: "Properties scored above this are auto-analyzed by agents"
- Add to `globalForm` state and `handleSaveGlobal` logic

- [ ] **Step 3: Commit**

```bash
git add src/hooks/use-criteria.ts src/pages/watchlists.tsx
git commit -m "feat: add auto-analyze score cutoff to criteria settings"
```

---

## Task 8: Frontend — "Ones to Watch" Dashboard Widget

**Files:**
- Create: `src/hooks/use-recommended.ts`
- Create: `src/components/dashboard/recommended-deals.tsx`
- Modify: `src/pages/dashboard.tsx`
- Modify: `src/components/property/deal-card-mini.tsx`

- [ ] **Step 1: Create useRecommended hook**

```typescript
// Queries user_recommendations JOIN properties
// WHERE recommended = true AND dismissed_at IS NULL AND market_status = 'active'
// Returns: { recommended: Property[], dismiss(id), watchProperty(id), loading }
// dismiss: UPDATE user_recommendations SET dismissed_at = now(), recommended = false
// watchProperty: calls addToPipeline(propertyId) then dismiss
```

- [ ] **Step 2: Create RecommendedDeals widget**

Full-width card above the dashboard grid showing recommended properties as a horizontal scrollable row of compact cards:
- Property image (or placeholder)
- Address, price, score badge
- Strategy tag (flip/rental/either)
- Market status badge: green dot "Active", yellow "Pending", red "Off Market"
- Two action buttons: "Watch" (adds to pipeline + dismisses) and "Dismiss" (X icon)
- If property has `stale_at`, show subtle "Stale" text indicator
- Empty state: "No new recommendations. Agents are scouting — check back soon."

- [ ] **Step 3: Add to Dashboard**

Import `RecommendedDeals` and add above the existing KPI cards grid. Pass `useRecommended()` data.

- [ ] **Step 4: Add market status + stale badges to deal cards globally**

In `DealCardMini`, add:
- If `market_status` is not 'active': show small colored badge (red "Off Market", yellow "Pending", gray "Sold")
- If `stale_at` is set: show subtle "Stale" text below the price
- Read these from `property` object (need to add `market_status` and `stale_at` to `Property` type in `use-properties.ts`)

- [ ] **Step 5: Commit**

```bash
git add src/hooks/use-recommended.ts src/components/dashboard/recommended-deals.tsx src/pages/dashboard.tsx src/components/property/deal-card-mini.tsx src/hooks/use-properties.ts
git commit -m "feat: add Ones to Watch dashboard widget with pipeline toggle and market badges"
```

---

## Revised Cost Estimate

| Component | Frequency | Cost per Run | Monthly Cost |
|-----------|-----------|-------------|-------------|
| Autoscout (staggered) | ~2.4/day (17/week) | ~$0.42 | ~$31/mo |
| Auto-analyst | ~15 properties/week | ~$0.02 | ~$1.30/mo |
| Market-check | ~15 properties/week | ~$0.08 | ~$5/mo |
| Digest | 1/week | ~$0.01 | ~$0.04/mo |
| **Total** | | | **~$37/mo** |

---

## Sequence Diagram

```
Daily 6AM ET (e.g., Monday):
  pg_cron → agent-autoscout
    → filters watchlists WHERE scout_day = 1 (Monday = 2-3 watchlists)
    → calls agent-scout for each watchlist
    → saves properties to DB with listing_url + image_url
    → calls agent-orchestrator { property_ids, user_id }
      → for each property (batches of 3 via Promise.allSettled):
        → skip if score < auto_analyze_min_score
        → skip analyst if property_analyses row already exists
        → call agent-analyst (if needed)
        → call agent-market-check
        → upsert user_recommendations if active + confident
      → run stale flagging SQL (flag + clear)

Monday 8AM ET:
  pg_cron → agent-digest
    → query week's scouted properties, recommendations, off-market, stale
    → generate HTML email
    → send via Resend API

User opens Dashboard:
  → sees "Ones to Watch" widget with recommended properties
  → clicks "Watch" → adds to pipeline, dismisses recommendation
  → clicks "Dismiss" → hides from recommendations
  → sees market status badges + stale indicators on all deal cards
```
