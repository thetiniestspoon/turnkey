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
