// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { parseCorpus } from '../../scripts/sim/lib/corpus'
import { DEFAULT_POLICY } from '../../scripts/sim/lib/policy'

const A = 'aaaaaaaa-1111-4111-8111-111111111111'
const B = 'bbbbbbbb-2222-4222-8222-222222222222'

function property(id: string) {
  return {
    id, address: `${id.slice(0, 4)} Main St`, city: 'Trenton', state: 'NJ', zip: '08601',
    property_type: 'single_family', list_price: 250000,
    raw_data: { score: 80, recommended_strategy: 'flip', estimated_flip_roi: 22, estimated_cap_rate: 8 },
  }
}

function analysis(id: string) {
  return {
    property_id: id,
    flip: { arv: 340000, renovation_est: 40000, carrying_costs: 12000, total_investment: 302000, profit_margin: 38000, roi: 22, timeline: '6 months', confidence: 70, explanation: 'x' },
    rental: { monthly_rent: 2400, monthly_expenses: 900, monthly_cash_flow: 1500, annual_noi: 18000, cap_rate: 8, cash_on_cash: 11, confidence: 65, explanation: 'x' },
    recommended_strategy: 'flip', overall_confidence: 80, summary: 'x', data_sources_used: [], data_gaps: [],
  }
}

function outcome(id: string) {
  return {
    property_id: id, terminal_status: 'sold', resolved_at: '2026-06-30',
    actuals: { arv: 340000, rental_income: 2400, renovation_cost: 60000 },
  }
}

const manifest = {
  id: 'test-corpus', synthetic: true, generated_by: 'test', seed: 1,
  as_of: '2026-04-01', horizon_days: 90, description: 'test',
  counts: { properties: 2 }, planted_biases: [],
}

function raw(over: Record<string, unknown> = {}) {
  return {
    manifest,
    properties: [property(B), property(A)],
    analyses: [analysis(A), analysis(B)],
    outcomes: [outcome(A), outcome(B)],
    policy: DEFAULT_POLICY,
    ...over,
  }
}

describe('parseCorpus', () => {
  it('joins each property with its analysis and outcome', () => {
    const c = parseCorpus(raw())
    expect(c.observations).toHaveLength(2)
    expect(c.observations[0].analysis.property_id).toBe(c.observations[0].property.id)
  })

  it('returns observations in a stable id-sorted order regardless of file order', () => {
    // The input above lists B before A. Order must not depend on that, or two corpora
    // with identical content but different file ordering would produce different runs.
    const c = parseCorpus(raw())
    expect(c.observations.map((o) => o.property.id)).toEqual([A, B])
  })

  it('exposes outcomes keyed by property id', () => {
    const c = parseCorpus(raw())
    expect(c.outcomes.get(A)?.property_id).toBe(A)
  })

  it('throws when a property has no analysis', () => {
    expect(() => parseCorpus(raw({ analyses: [analysis(A)] }))).toThrow(/analysis/i)
  })

  it('throws when a property has no outcome', () => {
    expect(() => parseCorpus(raw({ outcomes: [outcome(A)] }))).toThrow(/outcome/i)
  })

  it('throws when the manifest fails its schema', () => {
    expect(() => parseCorpus(raw({ manifest: { ...manifest, synthetic: undefined } }))).toThrow()
  })

  it('throws when an analysis violates the production analyst schema', () => {
    const broken = { ...analysis(A), overall_confidence: 500 }
    expect(() => parseCorpus(raw({ analyses: [broken, analysis(B)] }))).toThrow()
  })

  it('computes a content hash that ignores file ordering', () => {
    const forward = parseCorpus(raw())
    const reversed = parseCorpus(raw({ properties: [property(A), property(B)], outcomes: [outcome(B), outcome(A)] }))
    expect(forward.corpusHash).toBe(reversed.corpusHash)
  })

  it('computes a different hash when any content changes', () => {
    const a = parseCorpus(raw())
    const b = parseCorpus(raw({ properties: [property(A), { ...property(B), list_price: 999999 }] }))
    expect(a.corpusHash).not.toBe(b.corpusHash)
  })
})
