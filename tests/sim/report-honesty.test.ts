// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { fitCalibration, reliabilityGaps } from '../../scripts/sim/lib/calibrate'
import { pickWorstBand } from '../../scripts/sim/lib/report'

// Two defects found by actually reading the first generated report. Both are the same
// species of bug: a number that is *technically computed correctly* but described in
// prose as something it is not.

describe('a smoothed estimate is never reported as an observed rate', () => {
  it('exposes the raw observed clear rate alongside the smoothed one', () => {
    // Two samples in the 40-50 band, neither cleared. The Laplace-smoothed estimate is
    // (0 + 1*0.45)/(2+1) = 0.15 — but ZERO of them actually cleared. A report that
    // says "only 15% of them actually cleared" is simply false.
    const map = fitCalibration([{ p: 0.45, y: 0 }, { p: 0.45, y: 0 }], 'test')
    const b = map.buckets[4]
    expect(b.observed).toBe(0)
    expect(b.adjusted).toBeCloseTo(0.15, 10)
  })

  it('reports observed and smoothed separately in the gap view', () => {
    const map = fitCalibration([{ p: 0.85, y: 1 }, { p: 0.85, y: 0 }, { p: 0.85, y: 0 }, { p: 0.85, y: 0 }], 'test')
    const gaps = reliabilityGaps(map)
    const band = gaps.find((g) => g.lo === 0.8)!
    expect(band.observed).toBeCloseTo(0.25, 10)   // 1 of 4 — the truth
    expect(band.smoothed).toBeCloseTo(0.37, 10)   // what the map applies
  })

  it('measures the gap against the observed rate, not the smoothed one', () => {
    const map = fitCalibration([{ p: 0.85, y: 0 }, { p: 0.85, y: 0 }, { p: 0.85, y: 0 }, { p: 0.85, y: 0 }], 'test')
    const band = reliabilityGaps(map).find((g) => g.lo === 0.8)!
    expect(band.gap).toBeCloseTo(0 - 0.85, 10)
  })
})

describe('the worst-calibrated band is chosen by impact, not by noise', () => {
  it('prefers a large badly-calibrated band over a tiny one with a bigger raw gap', () => {
    const pairs = [
      // 2 samples at 0.45, none cleared -> gap -0.45, but only 2 decisions
      { p: 0.45, y: 0 }, { p: 0.45, y: 0 },
      // 20 samples at 0.85, 5 cleared -> gap -0.6 across 20 decisions: far more damage
      ...Array.from({ length: 5 }, () => ({ p: 0.85, y: 1 })),
      ...Array.from({ length: 15 }, () => ({ p: 0.85, y: 0 })),
    ]
    const band = pickWorstBand(reliabilityGaps(fitCalibration(pairs, 'test')))
    expect(band?.lo).toBe(0.8)
  })

  it('ignores bands too small to say anything about', () => {
    const pairs = [
      { p: 0.05, y: 0 },
      ...Array.from({ length: 12 }, () => ({ p: 0.55, y: 1 })),
    ]
    const band = pickWorstBand(reliabilityGaps(fitCalibration(pairs, 'test')))
    expect(band?.lo).toBe(0.5)
  })

  it('returns null when no band has enough evidence', () => {
    expect(pickWorstBand(reliabilityGaps(fitCalibration([{ p: 0.5, y: 1 }], 'test')))).toBeNull()
  })
})
