// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { realizedReturn, cleared, resolve } from '../../scripts/sim/lib/outcome'
import { DEFAULT_POLICY } from '../../scripts/sim/lib/policy'
import type { Observation, Outcome } from '../../src/schemas/simulation'

const PID = '11111111-2222-4333-8444-555555555555'

const obs: Observation = {
  property: {
    id: PID, address: '123 Main St', city: 'Trenton', state: 'NJ', zip: '08601',
    property_type: 'single_family', list_price: 250000,
    raw_data: { score: 80, recommended_strategy: 'flip', estimated_flip_roi: 22, estimated_cap_rate: 8 },
  },
  analysis: {
    property_id: PID,
    flip: {
      arv: 340000, renovation_est: 40000, carrying_costs: 12000,
      total_investment: 302000, profit_margin: 38000, roi: 22,
      timeline: '6 months', confidence: 70, explanation: 'x',
    },
    rental: {
      monthly_rent: 2400, monthly_expenses: 900, monthly_cash_flow: 1500,
      annual_noi: 18000, cap_rate: 8, cash_on_cash: 11, confidence: 65, explanation: 'x',
    },
    recommended_strategy: 'flip', overall_confidence: 80, summary: 'x',
    data_sources_used: [], data_gaps: [],
  },
}

const outcome: Outcome = {
  property_id: PID,
  terminal_status: 'sold',
  resolved_at: '2026-06-30',
  actuals: { arv: 340000, rental_income: 2400, renovation_cost: 60000 },
}

describe('realizedReturn — flip', () => {
  it('recomputes ROI on the actual ARV and actual renovation cost', () => {
    // basis = list 250000 + actual reno 60000 + underwritten carrying 12000 = 322000
    // roi   = (340000 - 322000) / 322000 * 100
    expect(realizedReturn(obs, outcome, 'flip')).toBeCloseTo(5.590062, 5)
  })

  it('goes negative when the actual ARV lands under the basis', () => {
    const bad = { ...outcome, actuals: { ...outcome.actuals, arv: 280000 } }
    expect(realizedReturn(obs, bad, 'flip')).toBeLessThan(0)
  })

  it('carries the renovation overrun — the same ARV with a bigger overrun scores worse', () => {
    const worse = { ...outcome, actuals: { ...outcome.actuals, renovation_cost: 90000 } }
    expect(realizedReturn(obs, worse, 'flip')).toBeLessThan(realizedReturn(obs, outcome, 'flip'))
  })
})

describe('realizedReturn — rental', () => {
  it('recomputes the cap rate on actual rent, holding underwritten expenses', () => {
    // ((2400 - 900) * 12) / 250000 * 100 = 7.2
    expect(realizedReturn(obs, outcome, 'rental')).toBeCloseTo(7.2, 10)
  })

  it('falls when the actual rent comes in under the forecast', () => {
    const soft = { ...outcome, actuals: { ...outcome.actuals, rental_income: 1800 } }
    expect(realizedReturn(obs, soft, 'rental')).toBeLessThan(7.2)
  })
})

describe('cleared', () => {
  it('is false when the realized flip ROI misses the flip hurdle', () => {
    // realized 5.59 vs hurdle 15
    expect(cleared(obs, outcome, 'flip', DEFAULT_POLICY)).toBe(false)
  })

  it('is true when the realized rental cap rate beats the rental hurdle', () => {
    // realized 7.2 vs hurdle 6.5
    expect(cleared(obs, outcome, 'rental', DEFAULT_POLICY)).toBe(true)
  })

  it('treats exactly meeting the hurdle as cleared', () => {
    const exact = { ...DEFAULT_POLICY, hurdle: { ...DEFAULT_POLICY.hurdle, rental_cap_rate_min: 7.2 } }
    expect(cleared(obs, outcome, 'rental', exact)).toBe(true)
  })
})

describe('resolve', () => {
  it('pairs a decision with its realized return and cleared label', () => {
    const r = resolve(obs, outcome, 'flip', DEFAULT_POLICY)
    expect(r.property_id).toBe(PID)
    expect(r.strategy).toBe('flip')
    expect(r.cleared).toBe(false)
    expect(r.realized_return).toBeCloseTo(5.590062, 5)
    expect(r.terminal_status).toBe('sold')
  })

  it('reports the shortfall against the hurdle', () => {
    const r = resolve(obs, outcome, 'flip', DEFAULT_POLICY)
    expect(r.shortfall).toBeCloseTo(15 - 5.590062, 5)
  })

  it('reports a negative shortfall when the deal beat its hurdle', () => {
    const r = resolve(obs, outcome, 'rental', DEFAULT_POLICY)
    expect(r.shortfall).toBeLessThan(0)
  })
})
