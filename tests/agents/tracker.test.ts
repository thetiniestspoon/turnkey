import { describe, it, expect } from 'vitest'
import { parseTrackerOutput } from '../../scripts/agents/lib/tracker'

const uuid = '22222222-2222-4222-8222-222222222222'
const sample = {
  property_id: uuid,
  comparisons: [{ metric: 'arv', predicted: 320000, actual: 330000, accuracy_pct: 97, assessment: 'close' }],
  overall_accuracy: 97, summary: 'accurate', recommendations: ['tighten reno est'],
}

describe('parseTrackerOutput', () => {
  it('validates via tracker Zod schema', () => {
    expect(parseTrackerOutput(JSON.stringify(sample)).overall_accuracy).toBe(97)
  })
  it('throws on overall_accuracy > 100', () => {
    expect(() => parseTrackerOutput(JSON.stringify({ ...sample, overall_accuracy: 150 }))).toThrow()
  })
})
