import type { CalibrationMap } from '@/schemas/simulation'

// The feedback signal.
//
// The analyst emits a confidence. The corpus says whether the deal actually cleared
// its hurdle. The gap between the two, measured per confidence bucket, IS the signal:
//
//     gap_k = observed_clear_rate_k − mean_forecast_p_k
//
// Fitting turns those gaps into a map that the next run's decide() consults, which is
// the whole feedback loop. No LLM, no network, fully replayable.

export const BUCKET_COUNT = 10

export function bucketIndex(p: number): number {
  if (!Number.isFinite(p)) return 0
  const clamped = Math.min(1, Math.max(0, p))
  return Math.min(BUCKET_COUNT - 1, Math.floor(clamped * BUCKET_COUNT))
}

function emptyBuckets() {
  return Array.from({ length: BUCKET_COUNT }, (_, i) => ({
    lo: i / BUCKET_COUNT,
    hi: (i + 1) / BUCKET_COUNT,
    n: 0,
    mean_p: (i + 0.5) / BUCKET_COUNT,
    observed: null as number | null,
    adjusted: null as number | null,
  }))
}

// Every bucket `adjusted: null` — p passes through untouched. This is the map a
// first-ever run uses, and the baseline the calibrated run is compared against.
export const IDENTITY_CALIBRATION: CalibrationMap = {
  version: 1,
  fitted_from: 'identity',
  buckets: emptyBuckets(),
}

// A bucket with no evidence must not invent any: `adjusted: null` means "pass through".
export function applyCalibration(p: number, map: CalibrationMap): number {
  const clamped = Math.min(1, Math.max(0, p))
  const b = map.buckets[bucketIndex(clamped)]
  if (!b || b.adjusted == null) return clamped
  return Math.min(1, Math.max(0, b.adjusted))
}

// Laplace pseudo-count: one imaginary observation sitting at the bucket's own mean
// forecast. It anchors the fit to "no change" and lets evidence pull it away, so a
// bucket holding a single sample nudges the curve instead of slamming it to 0 or 1.
// With 100 samples the pseudo-count is noise; with one it is half the story. That
// asymmetry is the point.
export const LAPLACE_ALPHA = 1

export type FitPair = { p: number; y: number }

// Fit the feedback signal: per bucket, gap_k = observed_clear_rate_k − mean_forecast_k.
// The map stores the smoothed observed rate, which applyCalibration substitutes for p.
export function fitCalibration(pairs: readonly FitPair[], fittedFrom: string): CalibrationMap {
  const acc = Array.from({ length: BUCKET_COUNT }, () => ({ n: 0, sumP: 0, sumY: 0 }))
  for (const { p, y } of pairs) {
    const b = acc[bucketIndex(p)]
    b.n++; b.sumP += p; b.sumY += y
  }
  const buckets = acc.map((b, i) => {
    const lo = i / BUCKET_COUNT
    const hi = (i + 1) / BUCKET_COUNT
    if (b.n === 0) return { lo, hi, n: 0, mean_p: (i + 0.5) / BUCKET_COUNT, observed: null, adjusted: null }
    const meanP = b.sumP / b.n
    const observed = b.sumY / b.n
    const adjusted = (b.sumY + LAPLACE_ALPHA * meanP) / (b.n + LAPLACE_ALPHA)
    return {
      lo, hi, n: b.n, mean_p: meanP,
      observed: Math.min(1, Math.max(0, observed)),
      adjusted: Math.min(1, Math.max(0, adjusted)),
    }
  })
  return { version: 1, fitted_from: fittedFrom, buckets }
}

export type ReliabilityGap = {
  lo: number; hi: number; n: number; mean_p: number
  observed: number   // what actually happened — quote this one
  smoothed: number   // what the map applies — an estimate, not an observation
  gap: number        // observed − forecast. THE feedback signal.
}

// The signal itself, exposed for the report: how far each bucket's forecast sat from
// what actually happened, and in which direction.
//
// `gap` is measured against `observed`, not `smoothed`. The smoothing exists to stop a
// thin bucket from yanking future decisions around; it must not also soften the
// description of what went wrong.
export function reliabilityGaps(map: CalibrationMap): ReliabilityGap[] {
  return map.buckets
    .filter((b) => b.n > 0 && b.observed != null && b.adjusted != null)
    .map((b) => ({
      lo: b.lo, hi: b.hi, n: b.n, mean_p: b.mean_p,
      observed: b.observed as number,
      smoothed: b.adjusted as number,
      gap: (b.observed as number) - b.mean_p,
    }))
}
