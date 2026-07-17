import { describe, it, expect } from 'vitest'
import { buildFinishPatch, SUBSCRIPTION_MODEL } from '../../scripts/agents/lib/run-log'

describe('buildFinishPatch', () => {
  it('always zeroes cost and stamps the subscription model', () => {
    const p = buildFinishPatch({ status: 'success', output_summary: 'Found 4 listings' })
    expect(p.cost_est).toBe(0)
    expect(p.tokens_used).toBe(0)
    expect(p.model).toBe(SUBSCRIPTION_MODEL)
    expect(p.status).toBe('success')
    expect(p.output_summary).toBe('Found 4 listings')
    expect(typeof p.completed_at).toBe('string')
  })
  it('supports timeout (quiet-night) status', () => {
    expect(buildFinishPatch({ status: 'timeout' }).status).toBe('timeout')
  })
})
