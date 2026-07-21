-- WS3 Phase 3 — decision simulation & backtest layer.
--
-- ############################################################################
-- ## NOT APPLIED. DO NOT RUN THIS YET.                                      ##
-- ##                                                                        ##
-- ## The simulation harness that landed alongside this file is entirely     ##
-- ## OFFLINE: it replays a checked-in fixture corpus and writes its results  ##
-- ## to stdout and to a JSON file. It does not read or write these tables.   ##
-- ##                                                                        ##
-- ## This migration occupies the slot reserved for it by the Phase 0-2 plan  ##
-- ## (which is why the autoscout cutover is numbered 00008), and documents   ##
-- ## the shape the persisted layer will take. Apply it only at the go-live   ##
-- ## step described in docs/superpowers/specs/2026-07-21-turnkey-simulation- ##
-- ## design.md §10 — AFTER a service-role key exists in .env and AFTER a     ##
-- ## fixture run has been reviewed.                                          ##
-- ############################################################################
--
-- House rule: no `supabase db push` to the shared project. When the time comes this
-- runs in the Dashboard SQL Editor, wrapped in BEGIN/COMMIT, followed by a migration
-- repair:  https://supabase.com/dashboard/project/xebulbfhwyezjrqobzow/sql/new

BEGIN;

-- The policy a backtest was run under. Kept as a row rather than as code constants so
-- "what would a stricter hurdle have decided?" is answerable without a deploy.
CREATE TABLE IF NOT EXISTS investment_policies (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid REFERENCES auth.users(id) ON DELETE CASCADE,
  name                text NOT NULL,
  capital_per_deal    numeric NOT NULL CHECK (capital_per_deal > 0),
  flip_roi_min        numeric NOT NULL,
  rental_cap_rate_min numeric NOT NULL,
  confidence_floor    numeric NOT NULL CHECK (confidence_floor BETWEEN 0 AND 100),
  criteria            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- One row per backtest run. run_id is the sha256 of (corpus, seed, policy, engine
-- version) computed by scripts/sim/lib/ledger.ts — the same value the CLI prints, so
-- a number in a report can always be traced to a row here.
CREATE TABLE IF NOT EXISTS backtest_runs (
  run_id            text PRIMARY KEY,
  policy_id         uuid REFERENCES investment_policies(id) ON DELETE SET NULL,
  corpus_id         text NOT NULL,
  corpus_hash       text NOT NULL,
  corpus_synthetic  boolean NOT NULL,
  engine_version    text NOT NULL,
  seed              bigint NOT NULL,
  as_of             date NOT NULL,
  n_fit             integer NOT NULL,
  n_holdout         integer NOT NULL,
  base_rate         numeric,
  brier_uncalibrated numeric,
  brier_calibrated   numeric,
  brier_skill_score  numeric,
  reliability        numeric,
  report_text       text,
  created_at        timestamptz NOT NULL DEFAULT now()
);

-- corpus_synthetic is NOT NULL on purpose: a run whose provenance is unknown must not
-- be storable. Any UI reading this table is expected to label synthetic runs loudly.
COMMENT ON COLUMN backtest_runs.corpus_synthetic IS
  'True when the corpus was generated rather than observed. A score from a synthetic corpus is evidence about the harness, not about the model.';

-- The decision ledger: one row per property per run.
CREATE TABLE IF NOT EXISTS simulated_decisions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id              text NOT NULL REFERENCES backtest_runs(run_id) ON DELETE CASCADE,
  property_id         uuid,
  split               text NOT NULL CHECK (split IN ('fit', 'holdout')),
  action              text NOT NULL CHECK (action IN ('buy', 'pass')),
  strategy            text NOT NULL CHECK (strategy IN ('flip', 'rental')),
  reason              text NOT NULL CHECK (reason IN ('criteria', 'hurdle', 'confidence', 'admitted')),
  underwritten_return numeric NOT NULL,
  hurdle              numeric NOT NULL,
  confidence_raw      numeric NOT NULL,
  p_calibrated        numeric NOT NULL,
  capital_committed   numeric NOT NULL DEFAULT 0,
  realized_return     numeric,
  shortfall           numeric,
  cleared             boolean,
  terminal_status     text,
  notes               text,
  UNIQUE (run_id, property_id)
);

CREATE INDEX IF NOT EXISTS idx_simulated_decisions_run ON simulated_decisions(run_id);
CREATE INDEX IF NOT EXISTS idx_simulated_decisions_property ON simulated_decisions(property_id);

-- The fitted feedback signal, one row per confidence band per run.
-- `observed` is the raw empirical clear rate; `smoothed` is the Laplace-smoothed
-- estimate the next run actually applies. Two columns, on purpose — conflating them
-- once already produced a report that stated a smoothed estimate as an observed fact.
CREATE TABLE IF NOT EXISTS calibration_buckets (
  id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_id    text NOT NULL REFERENCES backtest_runs(run_id) ON DELETE CASCADE,
  lo        numeric NOT NULL,
  hi        numeric NOT NULL,
  n         integer NOT NULL,
  mean_p    numeric NOT NULL,
  observed  numeric,
  smoothed  numeric,
  gap       numeric,
  UNIQUE (run_id, lo)
);

-- RLS: these tables are operator/analyst surface, not public. Policies mirror the
-- house pattern — owner reads own rows; `authenticated` is included in read roles per
-- feedback_supabase_rls_authenticated_read.
ALTER TABLE investment_policies  ENABLE ROW LEVEL SECURITY;
ALTER TABLE backtest_runs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE simulated_decisions  ENABLE ROW LEVEL SECURITY;
ALTER TABLE calibration_buckets  ENABLE ROW LEVEL SECURITY;

CREATE POLICY investment_policies_own ON investment_policies
  FOR ALL TO authenticated
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY backtest_runs_read ON backtest_runs
  FOR SELECT TO authenticated USING (true);

CREATE POLICY simulated_decisions_read ON simulated_decisions
  FOR SELECT TO authenticated USING (true);

CREATE POLICY calibration_buckets_read ON calibration_buckets
  FOR SELECT TO authenticated USING (true);

-- Writes come only from the harness, which uses the service-role key and bypasses RLS.
-- No INSERT/UPDATE policy is granted to `authenticated` deliberately: a backtest row
-- that a client could forge would make every calibration number worthless.

COMMIT;
