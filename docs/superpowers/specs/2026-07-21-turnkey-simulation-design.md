# Turnkey — Fixture-Driven Decision Simulation & Backtest Harness (WS3 Phase 3)

**Date:** 2026-07-21
**Branch:** `feat/turnkey-simulation-backtest` (stacked on `feat/turnkey-nightly-agents`, PR #1)
**Status:** design approved-by-default under an unsupervised overnight mandate; the unmerged PR is the operator review gate.

---

## 1. Why this exists

Turnkey's nightly pipeline (scout → analyst → market-check → tracker) *produces opinions*
about real-estate deals and has no way to find out whether those opinions were any good.
The analyst emits an `overall_confidence` (0–100) and three numeric forecasts
(`arv`, `rental_income`, `renovation_cost`), and `property_predictions.actual_value`
exists to hold what actually happened — but nothing closes the circuit between them.

This phase closes it, **offline**.

### Boundary (the thing that makes this safe to build unattended)

There is no `SUPABASE_SERVICE_ROLE_KEY` in `turnkey/.env`. The nightly harness has been
code-complete and unable to write since 2026-07-17. That absence is treated here as a
**design constraint, not a defect**: the entire simulation layer is built to run with

- **no network**,
- **no credentials**,
- **no LLM subprocess**,
- **no database.**

Everything it needs is a directory of checked-in JSON. The live data source gets exactly
one seam, gated on a boolean presence check of an env var (§8).

---

## 2. The decision loop, named explicitly

| Step | Name | What it is | Where it lives |
|---|---|---|---|
| 1 | **Observe** | A *corpus*: property rows in the shape the scout persists them, plus the recorded analyst output for each, plus a policy. | `lib/corpus.ts` |
| 2 | **Decide** | A pure function `decide(observation, policy, calibration) → Decision`. BUY or PASS, with a forecast probability. | `lib/decide.ts` |
| 3 | **Record** | Append the decision to a ledger keyed by `(run_id, property_id)`, carrying an input hash. | `lib/ledger.ts` |
| 4 | **Resolve** | The corpus's `outcomes.json` supplies realized values at the horizon. | `lib/outcome.ts` |
| 5 | **Score** | Brier, reliability table, per-metric bias/MAPE, decision confusion. | `lib/score.ts` |
| 6 | **Feed back** | Fit a bucketed calibration map from the reliability gap; the next `decide()` consults it. | `lib/calibrate.ts` |

### 2.1 What "a buying decision" is in this domain

For one property, at one observation time, under one policy:

> **BUY** — commit `policy.capital_per_deal` to this property under a named strategy
> (`flip` or `rental`), at the observed `list_price`.
> **PASS** — do not.

Turnkey never actually transacts, so "buy" is a *simulated commitment*. That is the
simplest defensible reading of "buying decision" for an app that scouts, underwrites and
recommends but does not close.

The decision is reached by five deterministic gates, in order. The first failing gate is
recorded as the pass reason:

1. **`criteria`** — `passesFilter(property, mergedCriteria)`, the function already ported
   verbatim from `agent-autoscout` into `scripts/agents/lib/orchestrate.ts`. Reusing it is
   deliberate: the simulator must reject exactly what production rejects, or the backtest
   measures a model nobody runs.
2. **`strategy`** — take `recommended_strategy`. If `either`, choose the strategy with the
   greater *headroom* over its own hurdle; exact ties go to `flip`.
3. **`hurdle`** — the chosen strategy's underwritten return (`flip.roi` or
   `rental.cap_rate`) must clear `policy.hurdle`.
4. **`confidence`** — the calibrated probability must clear `policy.confidence_floor`.
5. otherwise **BUY**.

Every decision — BUY *and* PASS — carries `p`, the forecast probability that this deal
**would clear its hurdle in reality**. Scoring uses all of them. Scoring only the BUYs
would grade the model on a sample it selected itself, which is how a backtest lies.

### 2.2 What "what actually happened" is

`outcomes.json` gives, per property:

```
{ property_id, terminal_status, resolved_at,
  actuals: { arv, rental_income, renovation_cost } }
```

Realized return is computed with the **same formula** as underwriting, substituting
actuals:

- `realized_flip_roi   = (actual_arv − basis) / basis × 100`,
  `basis = list_price + actual_renovation_cost + underwritten_carrying_costs`
- `realized_cap_rate   = ((actual_rental_income − underwritten_monthly_expenses) × 12) / list_price × 100`

**Stated simplification:** operating expenses and carrying costs are *not* observed by the
corpus, so they are carried at their underwritten values. Only ARV, rent and renovation
cost are realized. This means the score isolates the three things the analyst actually
forecasts, which is the point, but it also means a model that is wrong about expenses is
invisible to this harness. Written down here so it is not later mistaken for coverage.

**The label:** `cleared = realized_return ≥ hurdle`. Binary. `terminal_status` is *reported*
but not scored — it appears in the narrative account ("4 of the 9 bad buys were on
properties that went `off_market` before a transaction was ever possible"), because
status is real information about executability that the return number cannot carry.

### 2.3 The feedback signal, named precisely

> **The feedback signal is the per-bucket reliability gap:
> `gap_k = ō_k − p̄_k`** — the empirical clear-rate of decisions in confidence bucket `k`
> minus the mean forecast probability in that bucket.

Ten fixed buckets over `p ∈ [0,1]`. The fitted map replaces `p̄_k` with a
Laplace-smoothed empirical rate:

```
adjusted_k = (Σ y_i + α · p̄_k) / (n_k + α)          α = 1
```

so a bucket holding two samples nudges the curve rather than slamming it, and an empty
bucket is the identity. `applyCalibration(p, map)` maps a raw confidence through the
fitted curve on the next run. That is the whole loop — deterministic, no LLM, auditable.

### 2.4 In-sample honesty

Fitting and scoring on the same rows makes any calibration look good. The corpus is
therefore split deterministically by seed into a **fit half** and a **holdout half**:

- fit the map on the fit half,
- report Brier on the holdout half, **uncalibrated and calibrated**,
- the headline improvement is `Δ = Brier_uncal − Brier_cal` on the holdout.

A negative Δ is a real and publishable result: it means the calibration overfit.

---

## 3. The calibration number

Headline: **Brier score** on the holdout, `B = mean((pᵢ − yᵢ)²)`, lower is better.

Reported alongside:
- **Brier skill score** `BSS = 1 − B / B_ref`, `B_ref = base·(1−base)` from the fit half's
  base rate. Positive means better than always forecasting the base rate.
- **Reliability** `Σ nₖ(p̄ₖ − ōₖ)² / N` — the part of the Brier score calibration can fix.
- **Per-metric signed bias and MAPE** for `arv`, `rental_income`, `renovation_cost`.
- **Decision confusion**: hit / false-buy / miss / correct-pass, and precision on buys.

## 4. The human account of where the model was wrong

`renderTextReport()` emits, in plain sentences: the worst-calibrated bucket and its
direction; the metric with the largest signed bias and its size; the three most expensive
false buys (largest hurdle shortfall); and the terminal-status breakdown of false buys.
Prose, not a table dump — the point is that a person reads it and knows what to distrust.

## 5. Reproducibility contract

`run_id = sha256(corpusHash ‖ seed ‖ policyHash ‖ ENGINE_VERSION)`.

- **No wall-clock anywhere in the simulation path.** Report timestamps are the corpus's
  `as_of` field. `Date.now()` in `scripts/sim/**` is a test failure (`no-clock.test.ts`
  greps the source).
- Randomness is a checked-in `mulberry32` PRNG seeded from the run seed. No `Math.random`.
- A test runs the backtest twice and asserts byte-identical JSON output.

## 6. Fixture corpus

`tests/fixtures/sim/synthetic-trenton-2026q2/` — **synthetic, and labelled as such in
`manifest.json` (`"synthetic": true`) and in every report it produces.** 60 properties,
generated by `scripts/sim/generate-corpus.ts` from seed `20260721`, output checked in.
Regenerating with the same seed reproduces the files byte-for-byte; a test asserts it.

Shape mirrors production exactly: `properties.json` validates against the `properties`
upsert row shape, `analyses.json` against `analystOutputSchema` from `src/schemas/`.

The generator plants **two deliberate biases** so the harness has something real to find:
renovation cost is systematically underestimated, and confidence is inflated at the top of
its range. **A calibration number measured on a corpus whose bias was planted is not
evidence about the real Turnkey model.** It is evidence that the harness detects bias that
is present. Every report says so in its header.

## 7. Rejected design

**Full portfolio backtest with capital, financing and IRR.** Simulate a capital account,
allocate across deals, model holding periods, debt service and exit timing, and report
portfolio IRR against a benchmark.

Rejected because the output would be dominated by assumptions we would have to invent —
leverage ratio, rate, exit timing, vacancy — none of which Turnkey models or stores, and
none of which any offline corpus can validate. It would produce a confident-looking IRR
that measures our invented financing model rather than the analyst we are trying to grade.
The Brier design deliberately scores **one thing Turnkey actually asserts** (a confidence
attached to an underwriting) against **one thing the schema can actually observe**.

Portfolio accounting is not lost — `capital_per_deal` and `max_concurrent_positions` are in
the policy, and deployed-capital totals are reported. They are just not the score.

*(Also rejected: scoring live nightly against real listings — needs credentials and network,
outside tonight's boundary by construction.)*

## 8. The live seam

Exactly one, in `scripts/sim/lib/source.ts`:

```ts
export function liveSourceEnabled(env = process.env): boolean {
  const v = env.TURNKEY_SIM_LIVE_SOURCE
  return typeof v === 'string' && v.trim().length > 0
}
```

A boolean presence check. No key is read, no value is logged, no placeholder appears
anywhere that could be pasted into. When the flag is absent — always, today —
`loadObservations()` returns the fixture corpus. When present, it calls
`loadLiveObservations()`, which currently throws a single descriptive error naming the one
remaining step. Wiring it is a deliberate, reviewed change, not a config flip.

## 9. Wiring to the WS3 nightly harness

`scripts/agents/run-nightly.ts` gains `--stage=simulate`, placed **before**
`assertServiceRoleKey()` so the simulation runs on a machine with no credentials at all.
It keeps the billing guard (`billingVarsPresent`) and the `TURNKEY_AUTONOMY_OFF` kill
switch in the path. Replay mode spawns no `claude` subprocess — asserted by a test — so a
nightly simulate run is $0 and cannot be rate-limited.

`supabase/migrations/00007_simulation_layer.sql` is written into its reserved slot as
**documentation only**. It is not applied tonight and must not be run before the operator
gate in §10.

## 10. Exact remaining step to go live

One step, and it is the same gate WS3 has been waiting on since 2026-07-17:

> Add a `SUPABASE_SERVICE_ROLE_KEY` line to `turnkey/.env` — in the editor, by hand, from
> the Supabase dashboard. Nothing is pasted into a chat, a command, or a console.

Then, in order: apply `00007` via the SQL Editor; run `--stage=simulate --persist` to write
the first `backtest_runs` row; only then consider `TURNKEY_SIM_LIVE_SOURCE`.

## 11. File plan

```
scripts/sim/
  run-backtest.ts        CLI: corpus → replay → fit → holdout score → report
  generate-corpus.ts     seeded synthetic corpus generator (output checked in)
  lib/
    rng.ts               mulberry32 + seedFromString
    policy.ts            InvestmentPolicy + zod + DEFAULT_POLICY
    corpus.ts            load/validate a corpus dir; no network
    decide.ts            the model under test — pure
    outcome.ts           realized returns + cleared label
    calibrate.ts         buckets, fit, apply
    score.ts             brier, bss, reliability, mape, confusion
    ledger.ts            decision records + run_id hashing
    report.ts            text + json report
    source.ts            THE live seam
src/schemas/simulation.ts        zod contracts (additive; no existing src file touched)
tests/sim/*.test.ts
tests/fixtures/sim/synthetic-trenton-2026q2/
supabase/migrations/00007_simulation_layer.sql
```
