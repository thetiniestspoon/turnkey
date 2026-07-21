// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { brier, baseRate, brierSkillScore, reliability, metricError, confusion } from '../../scripts/sim/lib/score'

describe('brier', () => {
  it('is zero for a perfectly confident, perfectly correct forecaster', () => {
    expect(brier([{ p: 1, y: 1 }, { p: 0, y: 0 }])).toBe(0)
  })

  it('is one for a perfectly confident, perfectly wrong forecaster', () => {
    expect(brier([{ p: 1, y: 0 }, { p: 0, y: 1 }])).toBe(1)
  })

  it('is 0.25 for a forecaster who always says 50/50', () => {
    expect(brier([{ p: 0.5, y: 1 }, { p: 0.5, y: 0 }])).toBeCloseTo(0.25, 10)
  })

  it('is the mean squared error of the probabilities', () => {
    // (0.8-1)^2 = 0.04 ; (0.3-0)^2 = 0.09 ; mean = 0.065
    expect(brier([{ p: 0.8, y: 1 }, { p: 0.3, y: 0 }])).toBeCloseTo(0.065, 10)
  })

  it('returns NaN for an empty sample rather than a misleading zero', () => {
    expect(Number.isNaN(brier([]))).toBe(true)
  })
})

describe('baseRate', () => {
  it('is the fraction of outcomes that cleared', () => {
    expect(baseRate([{ p: 0.5, y: 1 }, { p: 0.5, y: 1 }, { p: 0.5, y: 0 }, { p: 0.5, y: 0 }])).toBeCloseTo(0.5, 10)
  })
})

describe('brierSkillScore', () => {
  it('is zero when the forecaster only matches the base-rate reference', () => {
    // base 0.5 -> reference brier 0.25
    expect(brierSkillScore(0.25, 0.5)).toBeCloseTo(0, 10)
  })

  it('is positive when the forecaster beats the base rate', () => {
    expect(brierSkillScore(0.1, 0.5)).toBeGreaterThan(0)
  })

  it('is negative when the forecaster is worse than the base rate', () => {
    expect(brierSkillScore(0.4, 0.5)).toBeLessThan(0)
  })

  it('is NaN when the reference is degenerate (everything cleared)', () => {
    expect(Number.isNaN(brierSkillScore(0.1, 1))).toBe(true)
  })
})

describe('reliability', () => {
  it('is zero for a perfectly calibrated forecaster', () => {
    // ten samples at p=0.5, exactly five of which clear
    const pairs = [
      ...Array.from({ length: 5 }, () => ({ p: 0.5, y: 1 })),
      ...Array.from({ length: 5 }, () => ({ p: 0.5, y: 0 })),
    ]
    expect(reliability(pairs)).toBeCloseTo(0, 10)
  })

  it('is large for a badly overconfident forecaster', () => {
    // says 0.95 every time; nothing ever clears
    const pairs = Array.from({ length: 10 }, () => ({ p: 0.95, y: 0 }))
    expect(reliability(pairs)).toBeCloseTo(0.9025, 6)
  })
})

describe('metricError', () => {
  it('reports a positive signed bias when predictions run high', () => {
    const e = metricError([{ predicted: 110, actual: 100 }, { predicted: 120, actual: 100 }])
    expect(e.bias_pct).toBeCloseTo(15, 6)
  })

  it('reports a negative signed bias when predictions run low', () => {
    const e = metricError([{ predicted: 80, actual: 100 }])
    expect(e.bias_pct).toBeCloseTo(-20, 6)
  })

  it('reports MAPE as an unsigned magnitude that does not cancel out', () => {
    const e = metricError([{ predicted: 120, actual: 100 }, { predicted: 80, actual: 100 }])
    expect(e.bias_pct).toBeCloseTo(0, 6)
    expect(e.mape_pct).toBeCloseTo(20, 6)
  })

  it('skips pairs with a zero actual rather than dividing by zero', () => {
    const e = metricError([{ predicted: 50, actual: 0 }, { predicted: 110, actual: 100 }])
    expect(e.n).toBe(1)
    expect(e.bias_pct).toBeCloseTo(10, 6)
  })
})

describe('confusion', () => {
  const rows = [
    { action: 'buy' as const, cleared: true },
    { action: 'buy' as const, cleared: true },
    { action: 'buy' as const, cleared: false },
    { action: 'pass' as const, cleared: true },
    { action: 'pass' as const, cleared: false },
    { action: 'pass' as const, cleared: false },
  ]

  it('counts each quadrant', () => {
    const c = confusion(rows)
    expect(c.hit).toBe(2)
    expect(c.false_buy).toBe(1)
    expect(c.miss).toBe(1)
    expect(c.correct_pass).toBe(2)
  })

  it('reports buy precision as hits over all buys', () => {
    expect(confusion(rows).buy_precision).toBeCloseTo(2 / 3, 10)
  })

  it('reports NaN precision when nothing was bought, not a fake 1.0', () => {
    const c = confusion([{ action: 'pass' as const, cleared: true }])
    expect(Number.isNaN(c.buy_precision)).toBe(true)
  })
})
