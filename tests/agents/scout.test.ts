import { describe, it, expect } from 'vitest'
import { buildScoutPrompt, parseScoutOutput, mapScoutPropertyToRow } from '../../scripts/agents/lib/scout'

const sample = {
  properties: [{
    address: '123 Main St', city: 'Trenton', state: 'NJ', zip: '08601',
    property_type: 'single_family', bedrooms: 3, bathrooms: 2, sqft: 1500, year_built: 1960,
    list_price: 250000, score: 82, rationale: 'Below comps', recommended_strategy: 'flip',
    estimated_flip_roi: 18, estimated_cap_rate: 7,
    listing_url: 'https://zillow.com/x', image_url: null,
  }],
  market_summary: 'Stable', data_sources_used: ['zillow'],
}

describe('buildScoutPrompt', () => {
  it('injects the market ZIP and demands JSON-only output', () => {
    const p = buildScoutPrompt({ market: '08601', marketData: { foo: 1 }, filters: {} })
    expect(p).toContain('08601')
    expect(p).toMatch(/JSON/i)
    expect(p).toContain('properties')
  })
})

describe('parseScoutOutput', () => {
  it('validates against the Zod schema and keeps listing_url/image_url', () => {
    const out = parseScoutOutput(JSON.stringify(sample))
    expect(out.properties[0].address).toBe('123 Main St')
    expect(out.properties[0].listing_url).toBe('https://zillow.com/x')
  })
  it('throws on schema violation (score out of range)', () => {
    const bad = { ...sample, properties: [{ ...sample.properties[0], score: 999 }] }
    expect(() => parseScoutOutput(JSON.stringify(bad))).toThrow()
  })
  it('throws when no JSON present', () => {
    expect(() => parseScoutOutput('sorry, nothing found')).toThrow()
  })
})

describe('mapScoutPropertyToRow', () => {
  it('maps to the properties upsert shape with the given source', () => {
    const out = parseScoutOutput(JSON.stringify(sample))
    const row = mapScoutPropertyToRow(out.properties[0], 'autoscout')
    expect(row.source).toBe('autoscout')
    expect(row.estimated_value).toBe(250000)
    expect(row.raw_data.score).toBe(82)
    expect(row.raw_data.listing_url).toBe('https://zillow.com/x')
    expect(row.raw_data).toHaveProperty('scouted_at')
  })
})
