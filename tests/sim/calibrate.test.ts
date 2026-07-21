// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { bucketIndex, applyCalibration, fitCalibration, IDENTITY_CALIBRATION, BUCKET_COUNT } from '../../scripts/sim/lib/calibrate'
import { calibrationMapSchema } from '../../src/schemas/simulation'

describe('bucketIndex', () => {
  it('puts 0 in the first bucket and 1 in the last', () => {
    expect(bucketIndex(0)).toBe(0)
    expect(bucketIndex(1)).toBe(BUCKET_COUNT - 1)
  })

  it('puts a bucket boundary in the upper bucket', () => {
    expect(bucketIndex(0.8)).toBe(8)
  })

  it('clamps out-of-range input instead of returning an undefined bucket', () => {
    expect(bucketIndex(-5)).toBe(0)
    expect(bucketIndex(99)).toBe(BUCKET_COUNT - 1)
  })
})

describe('applyCalibration', () => {
  it('passes p through unchanged under the identity map', () => {
    expect(applyCalibration(0.83, IDENTITY_CALIBRATION)).toBeCloseTo(0.83, 10)
  })

  it('passes p through unchanged for a bucket with no evidence', () => {
    const map = { ...IDENTITY_CALIBRATION, buckets: IDENTITY_CALIBRATION.buckets.map((b) => ({ ...b, adjusted: null })) }
    expect(applyCalibration(0.42, map)).toBeCloseTo(0.42, 10)
  })

  it('returns the fitted value for a bucket that has evidence', () => {
    const buckets = IDENTITY_CALIBRATION.buckets.map((b, i) => (i === 8 ? { ...b, n: 5, adjusted: 0.3 } : b))
    expect(applyCalibration(0.85, { ...IDENTITY_CALIBRATION, buckets })).toBeCloseTo(0.3, 10)
  })
})

describe('fitCalibration', () => {
  it('produces a map that satisfies the schema', () => {
    const map = fitCalibration([{ p: 0.85, y: 1 }, { p: 0.85, y: 0 }], 'test')
    expect(() => calibrationMapSchema.parse(map)).not.toThrow()
  })

  it('leaves buckets with no samples as identity', () => {
    const map = fitCalibration([{ p: 0.85, y: 1 }], 'test')
    expect(map.buckets[0].n).toBe(0)
    expect(map.buckets[0].adjusted).toBeNull()
  })

  it('pulls an overconfident bucket down toward its observed clear rate', () => {
    // four samples at p=0.85, one of which cleared. Laplace alpha=1 anchored at mean_p:
    // (1 + 1*0.85) / (4 + 1) = 0.37
    const pairs = [
      { p: 0.85, y: 1 }, { p: 0.85, y: 0 }, { p: 0.85, y: 0 }, { p: 0.85, y: 0 },
    ]
    const map = fitCalibration(pairs, 'test')
    expect(map.buckets[8].n).toBe(4)
    expect(map.buckets[8].mean_p).toBeCloseTo(0.85, 10)
    expect(map.buckets[8].adjusted).toBeCloseTo(0.37, 10)
  })

  it('smooths a single-sample bucket rather than slamming it to 0 or 1', () => {
    const map = fitCalibration([{ p: 0.95, y: 0 }], 'test')
    // (0 + 1*0.95) / (1 + 1) = 0.475 — moved, but not all the way to zero
    expect(map.buckets[9].adjusted).toBeCloseTo(0.475, 10)
    expect(map.buckets[9].adjusted).toBeGreaterThan(0)
  })

  it('barely moves a large, already-well-calibrated bucket', () => {
    // 100 samples at p=0.55, 55 of which cleared
    const pairs = [
      ...Array.from({ length: 55 }, () => ({ p: 0.55, y: 1 })),
      ...Array.from({ length: 45 }, () => ({ p: 0.55, y: 0 })),
    ]
    const map = fitCalibration(pairs, 'test')
    expect(map.buckets[5].adjusted).toBeCloseTo(0.55, 2)
  })

  it('records what it was fitted from', () => {
    expect(fitCalibration([{ p: 0.5, y: 1 }], 'fit-half of corpus-x').fitted_from).toBe('fit-half of corpus-x')
  })

  it('is deterministic', () => {
    const pairs = [{ p: 0.85, y: 1 }, { p: 0.15, y: 0 }, { p: 0.55, y: 1 }]
    expect(fitCalibration(pairs, 'x')).toEqual(fitCalibration(pairs, 'x'))
  })
})
