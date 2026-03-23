import { describe, it, expect } from 'vitest'

function computeAccuracy(predicted: number, actual: number): number {
  if (predicted === 0) return actual === 0 ? 100 : 0
  return Math.max(0, 100 - Math.abs((predicted - actual) / predicted) * 100)
}

describe('Prediction accuracy computation', () => {
  it('returns 100% for exact match', () => {
    expect(computeAccuracy(100000, 100000)).toBe(100)
  })

  it('returns correct accuracy for close prediction', () => {
    expect(computeAccuracy(100000, 95000)).toBe(95)
  })

  it('handles over-prediction', () => {
    expect(computeAccuracy(100000, 110000)).toBe(90)
  })

  it('handles zero predicted value', () => {
    expect(computeAccuracy(0, 0)).toBe(100)
    expect(computeAccuracy(0, 5000)).toBe(0)
  })
})
