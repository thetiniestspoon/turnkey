import { describe, it, expect } from 'vitest'
import { mergeCriteria, passesFilter, shouldRecommend } from '../../scripts/agents/lib/orchestrate'

describe('mergeCriteria', () => {
  it('overrides win over global', () => {
    const m = mergeCriteria({ max_price: 300000, min_score: 60, property_types: ['single_family'], strategies: ['flip'] }, { max_price: 250000 })
    expect(m.max_price).toBe(250000); expect(m.min_score).toBe(60)
  })
})

describe('passesFilter', () => {
  const crit = { max_price: 300000, min_cap_rate: 6, min_flip_roi: 10, min_score: 70, property_types: ['single_family'], strategies: ['flip', 'either'] }
  it('passes a compliant property', () => {
    expect(passesFilter({ list_price: 250000, property_type: 'single_family', raw_data: { score: 82, recommended_strategy: 'flip', estimated_cap_rate: 7, estimated_flip_roi: 12 } }, crit)).toBe(true)
  })
  it('fails on price over max', () => {
    expect(passesFilter({ list_price: 350000, property_type: 'single_family', raw_data: { score: 82, recommended_strategy: 'flip' } }, crit)).toBe(false)
  })
  it('fails on score under min', () => {
    expect(passesFilter({ list_price: 250000, property_type: 'single_family', raw_data: { score: 50, recommended_strategy: 'flip' } }, crit)).toBe(false)
  })
  it('fails on wrong property_type', () => {
    expect(passesFilter({ list_price: 250000, property_type: 'condo', raw_data: { score: 82, recommended_strategy: 'flip' } }, crit)).toBe(false)
  })
})

describe('shouldRecommend', () => {
  it('recommends active + confidence>=50', () => {
    expect(shouldRecommend('active', 68)).toBe(true)
    expect(shouldRecommend('active', 40)).toBe(false)
    expect(shouldRecommend('sold', 90)).toBe(false)
    expect(shouldRecommend('active', null)).toBe(false)
  })
})
