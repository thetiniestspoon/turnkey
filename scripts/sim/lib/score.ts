import { bucketIndex, BUCKET_COUNT } from './calibrate'

// Scoring.
//
// Everything here returns NaN rather than a plausible-looking number when the sample
// cannot support the statistic. A backtest that reports 0.0 for an empty sample, or a
// precision of 1.0 for a run that bought nothing, is worse than one that reports
// nothing — it invites a decision on evidence that does not exist.

export type Pair = { p: number; y: number }

// Brier score: mean squared error of a probabilistic forecast. 0 is perfect, 1 is
// perfectly wrong, 0.25 is the score of someone who always shrugs and says 50/50.
export function brier(pairs: readonly Pair[]): number {
  if (pairs.length === 0) return NaN
  let sum = 0
  for (const { p, y } of pairs) sum += (p - y) ** 2
  return sum / pairs.length
}

export function baseRate(pairs: readonly Pair[]): number {
  if (pairs.length === 0) return NaN
  let sum = 0
  for (const { y } of pairs) sum += y
  return sum / pairs.length
}

// Skill against the "always forecast the base rate" reference. Positive means the
// model's confidence carries information beyond how often deals clear in general.
// Degenerate when every deal cleared or none did — there is no reference to beat.
export function brierSkillScore(b: number, base: number): number {
  const reference = base * (1 - base)
  if (!Number.isFinite(reference) || reference === 0) return NaN
  return 1 - b / reference
}

// The reliability (calibration) term of the Murphy decomposition — the part of the
// Brier score that a calibration map can actually remove.
export function reliability(pairs: readonly Pair[]): number {
  if (pairs.length === 0) return NaN
  const buckets = Array.from({ length: BUCKET_COUNT }, () => ({ n: 0, sumP: 0, sumY: 0 }))
  for (const { p, y } of pairs) {
    const b = buckets[bucketIndex(p)]
    b.n++; b.sumP += p; b.sumY += y
  }
  let acc = 0
  for (const b of buckets) {
    if (b.n === 0) continue
    acc += b.n * ((b.sumP / b.n) - (b.sumY / b.n)) ** 2
  }
  return acc / pairs.length
}

export type MetricPair = { predicted: number; actual: number }
export type MetricError = { n: number; bias_pct: number; mape_pct: number }

// Signed bias answers "which direction is the model wrong?"; MAPE answers "by how
// much?". Reporting only MAPE hides systematic optimism, which is the failure mode
// that actually costs money.
export function metricError(pairs: readonly MetricPair[]): MetricError {
  const usable = pairs.filter((x) => x.actual !== 0 && Number.isFinite(x.actual) && Number.isFinite(x.predicted))
  if (usable.length === 0) return { n: 0, bias_pct: NaN, mape_pct: NaN }
  let bias = 0, mape = 0
  for (const { predicted, actual } of usable) {
    const err = (predicted - actual) / actual
    bias += err
    mape += Math.abs(err)
  }
  return { n: usable.length, bias_pct: (bias / usable.length) * 100, mape_pct: (mape / usable.length) * 100 }
}

export type ConfusionRow = { action: 'buy' | 'pass'; cleared: boolean }
export type Confusion = {
  hit: number; false_buy: number; miss: number; correct_pass: number
  buy_precision: number
}

export function confusion(rows: readonly ConfusionRow[]): Confusion {
  let hit = 0, falseBuy = 0, miss = 0, correctPass = 0
  for (const r of rows) {
    if (r.action === 'buy') r.cleared ? hit++ : falseBuy++
    else r.cleared ? miss++ : correctPass++
  }
  const buys = hit + falseBuy
  return { hit, false_buy: falseBuy, miss, correct_pass: correctPass, buy_precision: buys === 0 ? NaN : hit / buys }
}
