import { describe, it, expect } from 'vitest'
import { trackerOutputSchema } from '@/schemas/tracker-output'

describe('trackerOutputSchema', () => {
  it('accepts valid tracker output', () => {
    const valid = {
      property_id: '00000000-0000-0000-0000-000000000001',
      comparisons: [{
        metric: 'arv', predicted: 458000, actual: 445000,
        accuracy_pct: 97.2, assessment: 'Very close',
      }],
      overall_accuracy: 97.2,
      summary: 'Predictions were accurate',
      recommendations: ['Model is well-calibrated for this market'],
    }
    expect(trackerOutputSchema.parse(valid)).toBeDefined()
  })

  it('accepts empty comparisons array', () => {
    const valid = {
      property_id: '00000000-0000-0000-0000-000000000001',
      comparisons: [],
      overall_accuracy: 0,
      summary: 'No data',
      recommendations: [],
    }
    expect(trackerOutputSchema.parse(valid)).toBeDefined()
  })
})
