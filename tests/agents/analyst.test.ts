import { describe, it, expect } from 'vitest'
import { parseAnalystOutput, mapAnalysisToRow, mapPredictionRows } from '../../scripts/agents/lib/analyst'

const uuid = '11111111-1111-4111-8111-111111111111'
const sample = {
  property_id: uuid,
  flip: { arv: 320000, renovation_est: 45000, carrying_costs: 8000, total_investment: 300000, profit_margin: 20000, roi: 12, timeline: '6 months', confidence: 70, explanation: 'x' },
  rental: { monthly_rent: 2200, monthly_expenses: 900, monthly_cash_flow: 1300, annual_noi: 15600, cap_rate: 7.2, cash_on_cash: 9, confidence: 65, explanation: 'y' },
  recommended_strategy: 'flip', overall_confidence: 68, summary: 'Solid flip', data_sources_used: ['census_acs'], data_gaps: [],
}

describe('parseAnalystOutput', () => {
  it('validates via the analyst Zod schema', () => {
    expect(parseAnalystOutput(JSON.stringify(sample)).overall_confidence).toBe(68)
  })
  it('throws on a bad UUID', () => {
    expect(() => parseAnalystOutput(JSON.stringify({ ...sample, property_id: 'nope' }))).toThrow()
  })
})

describe('mapAnalysisToRow — mapping gotchas', () => {
  it('maps rental_monthly_est from rental.monthly_rent, confidence_score from overall_confidence, analysis_summary from summary', () => {
    const out = parseAnalystOutput(JSON.stringify(sample))
    const row = mapAnalysisToRow(out, uuid, 'claude-code-subscription', { pop: 1 })
    expect(row.property_id).toBe(uuid)
    expect(row.rental_monthly_est).toBe(2200)
    expect(row.confidence_score).toBe(68)
    expect(row.analysis_summary).toBe('Solid flip')
    expect(row.neighborhood_data).toEqual({ pop: 1 })
    expect(row.agent_model).toBe('claude-code-subscription')
    expect(row.flip_arv).toBe(320000)
  })
})

describe('mapPredictionRows', () => {
  it('emits arv, rental_income, renovation_cost with correct sources', () => {
    const out = parseAnalystOutput(JSON.stringify(sample))
    const rows = mapPredictionRows(out, uuid)
    expect(rows).toEqual([
      { property_id: uuid, metric: 'arv', predicted_value: 320000 },
      { property_id: uuid, metric: 'rental_income', predicted_value: 2200 },
      { property_id: uuid, metric: 'renovation_cost', predicted_value: 45000 },
    ])
  })
})
