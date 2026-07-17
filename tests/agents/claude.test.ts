import { describe, it, expect } from 'vitest'
import { extractJson, isRateLimited } from '../../scripts/agents/lib/claude'

describe('extractJson', () => {
  it('parses a bare object', () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 })
  })
  it('parses JSON embedded in prose and code fences', () => {
    expect(extractJson('Sure!\n```json\n{"a":1,"b":[2,3]}\n```\nDone')).toEqual({ a: 1, b: [2, 3] })
  })
  it('returns null when no JSON object present', () => {
    expect(extractJson('no json here')).toBeNull()
    expect(extractJson('')).toBeNull()
  })
  it('returns null on malformed JSON', () => {
    expect(extractJson('{"a": }')).toBeNull()
  })
})

describe('isRateLimited', () => {
  it('detects usage/rate limit phrasings', () => {
    expect(isRateLimited('Claude usage limit reached')).toBe(true)
    expect(isRateLimited('rate limit exceeded, please try again later')).toBe(true)
    expect(isRateLimited('5-hour limit reached ∙ resets at 9pm')).toBe(true)
    expect(isRateLimited('Error: 429 Too Many Requests')).toBe(true)
  })
  it('does not flag normal output', () => {
    expect(isRateLimited('{"properties":[]}')).toBe(false)
  })
})
