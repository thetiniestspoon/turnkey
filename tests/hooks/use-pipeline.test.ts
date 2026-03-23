import { describe, it, expect } from 'vitest'
import { isValidTransition } from '@/data/pipeline-stages'

describe('Pipeline state machine', () => {
  it('allows forward transitions', () => {
    expect(isValidTransition('watching', 'analyzing')).toBe(true)
    expect(isValidTransition('watching', 'acquired')).toBe(true)
    expect(isValidTransition('offer', 'closed')).toBe(true)
  })

  it('rejects backward transitions', () => {
    expect(isValidTransition('acquired', 'watching')).toBe(false)
    expect(isValidTransition('analyzing', 'watching')).toBe(false)
  })

  it('rejects same-stage transitions', () => {
    expect(isValidTransition('watching', 'watching')).toBe(false)
  })
})
