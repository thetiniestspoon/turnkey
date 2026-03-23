import { describe, it, expect } from 'vitest'
import { stageTransitionSchema } from '@/schemas/pipeline-stage'

describe('stageTransitionSchema', () => {
  it('accepts valid forward transition', () => {
    expect(stageTransitionSchema.parse({ from: 'watching', to: 'analyzing' })).toBeDefined()
  })

  it('accepts skipping stages forward', () => {
    expect(stageTransitionSchema.parse({ from: 'watching', to: 'acquired' })).toBeDefined()
  })

  it('rejects backward transition', () => {
    expect(() => stageTransitionSchema.parse({ from: 'acquired', to: 'watching' })).toThrow()
  })

  it('rejects same-stage transition', () => {
    expect(() => stageTransitionSchema.parse({ from: 'watching', to: 'watching' })).toThrow()
  })

  it('rejects invalid stage name', () => {
    expect(() => stageTransitionSchema.parse({ from: 'watching', to: 'invalid' })).toThrow()
  })
})
