import { describe, it, expect } from 'vitest'
import { scoutOutputSchema } from '@/schemas/scout-output'

describe('scoutOutputSchema', () => {
  it('accepts valid scout output', () => {
    const valid = {
      properties: [{
        address: '742 Elm St', city: 'Austin', state: 'TX', zip: '78704',
        property_type: 'single_family', list_price: 285000, score: 92,
        rationale: 'Below market', recommended_strategy: 'flip',
      }],
      market_summary: 'Austin market is hot',
      data_sources_used: ['census', 'fred'],
    }
    expect(scoutOutputSchema.parse(valid)).toBeDefined()
  })

  it('rejects missing properties array', () => {
    expect(() => scoutOutputSchema.parse({ market_summary: 'test', data_sources_used: [] })).toThrow()
  })

  it('rejects invalid state code', () => {
    const invalid = {
      properties: [{
        address: '742 Elm St', city: 'Austin', state: 'Texas', zip: '78704',
        property_type: 'single_family', list_price: 285000, score: 92,
        rationale: 'Below market', recommended_strategy: 'flip',
      }],
      market_summary: 'test', data_sources_used: [],
    }
    expect(() => scoutOutputSchema.parse(invalid)).toThrow()
  })

  it('rejects score out of range', () => {
    const invalid = {
      properties: [{
        address: '742 Elm St', city: 'Austin', state: 'TX', zip: '78704',
        property_type: 'single_family', list_price: 285000, score: 150,
        rationale: 'Below market', recommended_strategy: 'flip',
      }],
      market_summary: 'test', data_sources_used: [],
    }
    expect(() => scoutOutputSchema.parse(invalid)).toThrow()
  })
})
