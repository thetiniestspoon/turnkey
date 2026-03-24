import { describe, it, expect } from 'vitest'
import { analystOutputSchema } from '@/schemas/analyst-output'

const validAnalysis = {
  property_id: '00000000-0000-0000-0000-000000000001',
  flip: {
    arv: 458000, renovation_est: 45000, carrying_costs: 12000,
    total_investment: 342000, profit_margin: 116000, roi: 34,
    timeline: '4-6 months', confidence: 85, explanation: 'Strong comp data',
  },
  rental: {
    monthly_rent: 2100, monthly_expenses: 1250, monthly_cash_flow: 850,
    annual_noi: 10200, cap_rate: 7.8, cash_on_cash: 9.1,
    confidence: 72, explanation: 'HUD FMR supports estimate',
  },
  recommended_strategy: 'flip',
  overall_confidence: 85,
  summary: 'Strong flip candidate',
  data_sources_used: ['census', 'fred', 'hud'],
  data_gaps: [],
}

describe('analystOutputSchema', () => {
  it('accepts valid analyst output', () => {
    expect(analystOutputSchema.parse(validAnalysis)).toBeDefined()
  })

  it('rejects missing flip section', () => {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { flip, ...noFlip } = validAnalysis
    expect(() => analystOutputSchema.parse(noFlip)).toThrow()
  })

  it('rejects invalid confidence score', () => {
    const invalid = { ...validAnalysis, overall_confidence: 200 }
    expect(() => analystOutputSchema.parse(invalid)).toThrow()
  })

  it('rejects invalid property_id format', () => {
    const invalid = { ...validAnalysis, property_id: 'not-a-uuid' }
    expect(() => analystOutputSchema.parse(invalid)).toThrow()
  })
})
