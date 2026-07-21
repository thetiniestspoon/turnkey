// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { decide } from '../../scripts/sim/lib/decide'
import { DEFAULT_POLICY, investmentPolicySchema } from '../../scripts/sim/lib/policy'
import { IDENTITY_CALIBRATION } from '../../scripts/sim/lib/calibrate'
import type { Observation } from '../../src/schemas/simulation'

const PID = '11111111-2222-4333-8444-555555555555'

function observation(over: {
  list_price?: number
  score?: number
  property_type?: string
  strategy?: 'flip' | 'rental' | 'either'
  flip_roi?: number
  cap_rate?: number
  confidence?: number
} = {}): Observation {
  const strategy = over.strategy ?? 'flip'
  const flipRoi = over.flip_roi ?? 22
  const capRate = over.cap_rate ?? 8
  return {
    property: {
      id: PID,
      address: '123 Main St', city: 'Trenton', state: 'NJ', zip: '08601',
      property_type: over.property_type ?? 'single_family',
      list_price: over.list_price ?? 250000,
      raw_data: {
        score: over.score ?? 80,
        recommended_strategy: strategy,
        estimated_flip_roi: flipRoi,
        estimated_cap_rate: capRate,
      },
    },
    analysis: {
      property_id: PID,
      flip: {
        arv: 340000, renovation_est: 40000, carrying_costs: 12000,
        total_investment: 302000, profit_margin: 38000, roi: flipRoi,
        timeline: '6 months', confidence: 70, explanation: 'comps support it',
      },
      rental: {
        monthly_rent: 2400, monthly_expenses: 900, monthly_cash_flow: 1500,
        annual_noi: 18000, cap_rate: capRate, cash_on_cash: 11,
        confidence: 65, explanation: 'rents are firm',
      },
      recommended_strategy: strategy,
      overall_confidence: over.confidence ?? 80,
      summary: 'solid deal',
      data_sources_used: ['zillow'],
      data_gaps: [],
    },
  }
}

describe('DEFAULT_POLICY', () => {
  it('satisfies its own schema', () => {
    expect(() => investmentPolicySchema.parse(DEFAULT_POLICY)).not.toThrow()
  })
})

describe('decide — gates', () => {
  it('buys a property that clears criteria, hurdle and confidence', () => {
    const d = decide(observation(), DEFAULT_POLICY, IDENTITY_CALIBRATION)
    expect(d.action).toBe('buy')
    expect(d.reason).toBe('admitted')
    expect(d.strategy).toBe('flip')
    expect(d.capital_committed).toBe(DEFAULT_POLICY.capital_per_deal)
  })

  it('passes on criteria when the list price exceeds policy max_price', () => {
    const d = decide(observation({ list_price: 900000 }), DEFAULT_POLICY, IDENTITY_CALIBRATION)
    expect(d.action).toBe('pass')
    expect(d.reason).toBe('criteria')
    expect(d.capital_committed).toBe(0)
  })

  it('passes on criteria when the scout score is below policy min_score', () => {
    const d = decide(observation({ score: 20 }), DEFAULT_POLICY, IDENTITY_CALIBRATION)
    expect(d.action).toBe('pass')
    expect(d.reason).toBe('criteria')
  })

  it('passes on hurdle when the underwritten flip ROI is below the flip hurdle', () => {
    const d = decide(observation({ flip_roi: 3 }), DEFAULT_POLICY, IDENTITY_CALIBRATION)
    expect(d.action).toBe('pass')
    expect(d.reason).toBe('hurdle')
    expect(d.underwritten_return).toBe(3)
    expect(d.hurdle).toBe(DEFAULT_POLICY.hurdle.flip_roi_min)
  })

  it('passes on confidence when calibrated p falls below the floor', () => {
    const d = decide(observation({ confidence: 20 }), DEFAULT_POLICY, IDENTITY_CALIBRATION)
    expect(d.action).toBe('pass')
    expect(d.reason).toBe('confidence')
  })

  it('checks criteria before hurdle — a property failing both reports criteria', () => {
    const d = decide(observation({ list_price: 900000, flip_roi: 1 }), DEFAULT_POLICY, IDENTITY_CALIBRATION)
    expect(d.reason).toBe('criteria')
  })
})

describe('decide — strategy selection', () => {
  it('uses the rental hurdle when the analyst recommends rental', () => {
    const d = decide(observation({ strategy: 'rental', cap_rate: 9 }), DEFAULT_POLICY, IDENTITY_CALIBRATION)
    expect(d.strategy).toBe('rental')
    expect(d.underwritten_return).toBe(9)
    expect(d.hurdle).toBe(DEFAULT_POLICY.hurdle.rental_cap_rate_min)
  })

  it('on "either", picks the strategy with more headroom over its own hurdle', () => {
    // flip 16 vs hurdle 15 => headroom 1; rental 12 vs hurdle 6.5 => headroom 5.5
    const d = decide(observation({ strategy: 'either', flip_roi: 16, cap_rate: 12 }), DEFAULT_POLICY, IDENTITY_CALIBRATION)
    expect(d.strategy).toBe('rental')
  })

  it('on "either" with equal headroom, breaks the tie toward flip', () => {
    // flip 20 vs 15 => 5; rental 11.5 vs 6.5 => 5
    const d = decide(observation({ strategy: 'either', flip_roi: 20, cap_rate: 11.5 }), DEFAULT_POLICY, IDENTITY_CALIBRATION)
    expect(d.strategy).toBe('flip')
  })
})

describe('decide — calibration', () => {
  it('reports the raw confidence unchanged and p as a probability', () => {
    const d = decide(observation({ confidence: 80 }), DEFAULT_POLICY, IDENTITY_CALIBRATION)
    expect(d.confidence_raw).toBe(80)
    expect(d.p).toBeCloseTo(0.8, 10)
  })

  it('routes p through the calibration map, which can flip a buy into a pass', () => {
    // A map that says "everything you called 0.8 actually cleared 10% of the time".
    const pessimistic = { ...IDENTITY_CALIBRATION, buckets: IDENTITY_CALIBRATION.buckets.map((b) => ({ ...b, adjusted: 0.1 })) }
    const d = decide(observation({ confidence: 80 }), DEFAULT_POLICY, pessimistic)
    expect(d.p).toBeCloseTo(0.1, 10)
    expect(d.action).toBe('pass')
    expect(d.reason).toBe('confidence')
  })
})

describe('decide — purity', () => {
  it('returns an identical decision for identical inputs', () => {
    const o = observation()
    expect(decide(o, DEFAULT_POLICY, IDENTITY_CALIBRATION)).toEqual(decide(o, DEFAULT_POLICY, IDENTITY_CALIBRATION))
  })

  it('does not mutate the observation it is given', () => {
    const o = observation()
    const snapshot = JSON.parse(JSON.stringify(o))
    decide(o, DEFAULT_POLICY, IDENTITY_CALIBRATION)
    expect(o).toEqual(snapshot)
  })
})
