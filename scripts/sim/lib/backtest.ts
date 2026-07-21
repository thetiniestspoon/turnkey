import type { CalibrationMap, Decision } from '@/schemas/simulation'
import type { Corpus } from './corpus'
import { DEFAULT_POLICY, type InvestmentPolicy } from './policy'
import { decide } from './decide'
import { resolve } from './outcome'
import { fitCalibration, IDENTITY_CALIBRATION, reliabilityGaps } from './calibrate'
import { brier, baseRate, brierSkillScore, reliability, metricError, confusion, type Confusion, type MetricError, type Pair } from './score'
import { buildLedgerRecord, computeRunId, hashObject, ENGINE_VERSION, type LedgerRecord } from './ledger'
import { splitByHash } from './rng'

// The loop, assembled.
//
//   observe -> decide -> record -> resolve -> score -> feed back
//
// The one structural decision worth stating: the calibration map is fitted on one half
// of the corpus and the headline score is reported on the OTHER half. Fitting and
// scoring on the same rows would always show an improvement — that is what fitting
// means — and the number would be an artefact rather than a finding.

export type Headline = {
  evaluated_on: 'holdout'
  n: number
  base_rate: number
  brier_uncalibrated: number
  brier_calibrated: number
  delta: number
  brier_skill_score: number
  reliability_uncalibrated: number
  reliability_calibrated: number
}

export type BacktestResult = {
  run_id: string
  engine_version: string
  as_of: string
  corpus: { id: string; synthetic: boolean; planted_biases: string[]; hash: string; count: number }
  policy: InvestmentPolicy
  seed: number
  split_sizes: { fit: number; holdout: number }
  calibration: CalibrationMap
  reliability_gaps: ReturnType<typeof reliabilityGaps>
  headline: Headline
  confusion: Confusion
  metric_errors: { arv: MetricError; rental_income: MetricError; renovation_cost: MetricError }
  capital: { deployed: number; positions: number }
  ledger: LedgerRecord[]
}

function decisionsFor(corpus: Corpus, policy: InvestmentPolicy, calibration: CalibrationMap, ids: Set<string>) {
  const out: Array<{ decision: Decision; pair: Pair; cleared: boolean }> = []
  for (const o of corpus.observations) {
    if (!ids.has(o.property.id)) continue
    const d = decide(o, policy, calibration)
    const outcome = corpus.outcomes.get(o.property.id)
    if (!outcome) throw new Error(`backtest: no outcome for ${o.property.id}`)
    const r = resolve(o, outcome, d.strategy, policy)
    out.push({ decision: d, pair: { p: d.p, y: r.cleared ? 1 : 0 }, cleared: r.cleared })
  }
  return out
}

export function runBacktest(args: { corpus: Corpus; seed: number; policy?: InvestmentPolicy }): BacktestResult {
  const { corpus, seed } = args
  const policy = args.policy ?? corpus.policy ?? DEFAULT_POLICY

  const allIds = corpus.observations.map((o) => o.property.id)
  const { fit, holdout } = splitByHash(allIds, seed)
  const fitIds = new Set(fit)
  const holdoutIds = new Set(holdout)

  // ── Pass 1: decide uncalibrated, on both halves ───────────────────────────
  const fitUncal = decisionsFor(corpus, policy, IDENTITY_CALIBRATION, fitIds)
  const holdoutUncal = decisionsFor(corpus, policy, IDENTITY_CALIBRATION, holdoutIds)

  // ── Feed back: fit the reliability gap on the FIT half only ───────────────
  const calibration = fitCalibration(fitUncal.map((x) => x.pair), `fit half of ${corpus.manifest.id} (seed ${seed})`)

  // ── Pass 2: re-decide the HOLDOUT half through the fitted map ─────────────
  const holdoutCal = decisionsFor(corpus, policy, calibration, holdoutIds)

  const uncalPairs = holdoutUncal.map((x) => x.pair)
  const calPairs = holdoutCal.map((x) => x.pair)
  const bUncal = brier(uncalPairs)
  const bCal = brier(calPairs)
  const base = baseRate(uncalPairs)

  // Metric errors are computed over the whole corpus: they describe the analyst's
  // forecasting, which the fit/holdout split has no bearing on.
  const arv: Array<{ predicted: number; actual: number }> = []
  const rent: Array<{ predicted: number; actual: number }> = []
  const reno: Array<{ predicted: number; actual: number }> = []
  for (const o of corpus.observations) {
    const outcome = corpus.outcomes.get(o.property.id)
    if (!outcome) continue
    arv.push({ predicted: o.analysis.flip.arv, actual: outcome.actuals.arv })
    rent.push({ predicted: o.analysis.rental.monthly_rent, actual: outcome.actuals.rental_income })
    reno.push({ predicted: o.analysis.flip.renovation_est, actual: outcome.actuals.renovation_cost })
  }

  const runId = computeRunId({
    corpusHash: corpus.corpusHash,
    seed,
    policyHash: hashObject(policy),
  })

  // The ledger records the CALIBRATED decision on the holdout half (what the model
  // would do next run) and the uncalibrated decision on the fit half (what it did).
  const ledger: LedgerRecord[] = []
  for (const o of corpus.observations) {
    const id = o.property.id
    const split: 'fit' | 'holdout' = fitIds.has(id) ? 'fit' : 'holdout'
    const source = split === 'fit' ? fitUncal : holdoutCal
    const entry = source.find((x) => x.decision.property_id === id)
    if (!entry) continue
    const outcome = corpus.outcomes.get(id)!
    ledger.push(buildLedgerRecord({
      runId, split, decision: entry.decision,
      resolution: resolve(o, outcome, entry.decision.strategy, policy),
    }))
  }
  ledger.sort((a, b) => (a.property_id < b.property_id ? -1 : a.property_id > b.property_id ? 1 : 0))

  const holdoutRows = holdoutCal.map((x) => ({ action: x.decision.action, cleared: x.cleared }))
  const buys = ledger.filter((r) => r.action === 'buy')

  return {
    run_id: runId,
    engine_version: ENGINE_VERSION,
    as_of: corpus.manifest.as_of,
    corpus: {
      id: corpus.manifest.id,
      synthetic: corpus.manifest.synthetic,
      planted_biases: corpus.manifest.planted_biases,
      hash: corpus.corpusHash,
      count: corpus.observations.length,
    },
    policy,
    seed,
    split_sizes: { fit: fit.length, holdout: holdout.length },
    calibration,
    reliability_gaps: reliabilityGaps(calibration),
    headline: {
      evaluated_on: 'holdout',
      n: holdout.length,
      base_rate: base,
      brier_uncalibrated: bUncal,
      brier_calibrated: bCal,
      delta: bUncal - bCal,
      brier_skill_score: brierSkillScore(bUncal, base),
      reliability_uncalibrated: reliability(uncalPairs),
      reliability_calibrated: reliability(calPairs),
    },
    confusion: confusion(holdoutRows),
    metric_errors: {
      arv: metricError(arv),
      rental_income: metricError(rent),
      renovation_cost: metricError(reno),
    },
    capital: {
      deployed: buys.reduce((acc, r) => acc + r.capital_committed, 0),
      positions: buys.length,
    },
    ledger,
  }
}
