-- Watchlists
CREATE TABLE watchlists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  name text NOT NULL,
  zip text NOT NULL,
  city text,
  state text,
  criteria_overrides jsonb,
  active boolean DEFAULT true,
  last_scouted_at timestamptz,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Investment Criteria (one per user)
CREATE TABLE investment_criteria (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) UNIQUE,
  max_price numeric,
  min_cap_rate numeric,
  min_flip_roi numeric,
  property_types text[] DEFAULT ARRAY['single_family','multi_family','condo','townhouse'],
  min_score int DEFAULT 60,
  strategies text[] DEFAULT ARRAY['flip','rental','either'],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- RLS
ALTER TABLE watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE investment_criteria ENABLE ROW LEVEL SECURITY;

CREATE POLICY users_own_watchlists ON watchlists FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY users_own_criteria ON investment_criteria FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY anon_read_watchlists ON watchlists FOR SELECT TO anon USING (true);
CREATE POLICY anon_read_criteria ON investment_criteria FOR SELECT TO anon USING (true);

-- Triggers
CREATE TRIGGER watchlists_updated_at BEFORE UPDATE ON watchlists
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
CREATE TRIGGER criteria_updated_at BEFORE UPDATE ON investment_criteria
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
