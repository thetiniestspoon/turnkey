-- Audit fixes: market_data constraint + watchlist name encoding
-- Applied: 2026-03-31

-- Fix 1: Widen market_data data_type constraint to match agent-enricher
-- The enricher caches 6 data types but the original constraint only allowed 3,
-- causing bls_unemployment, fema_flood, and walkability cache inserts to silently fail.
ALTER TABLE market_data DROP CONSTRAINT IF EXISTS market_data_data_type_check;
ALTER TABLE market_data ADD CONSTRAINT market_data_data_type_check
  CHECK (data_type IN ('census_acs', 'fred_rates', 'hud_fmr', 'bls_unemployment', 'fema_flood', 'walkability'));

-- Fix 3: Repair double-encoded UTF-8 characters in watchlist names
-- Em dashes were stored as 'â€"' instead of '—' due to UTF-8 double-encoding during seed.
UPDATE watchlists SET name = REPLACE(name, 'â€"', '—') WHERE name LIKE '%â€"%';
UPDATE watchlists SET name = REPLACE(name, 'â€™', E'\u2019') WHERE name LIKE '%â€™%';
UPDATE watchlists SET name = REPLACE(name, 'â€œ', E'\u201C') WHERE name LIKE '%â€œ%';
