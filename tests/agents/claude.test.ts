import { describe, it, expect } from 'vitest'
import { extractJson, isRateLimited, billingVarsPresent } from '../../scripts/agents/lib/claude'

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
  it('does not flag LLM JSON containing a bare 429-shaped number', () => {
    expect(isRateLimited('{"monthly_cash_flow":429,"cap_rate":7}')).toBe(false)
  })
  it('does not flag LLM JSON containing "resets at" with no limit phrase', () => {
    expect(isRateLimited('{"notes":"open house resets at noon","status":"active"}')).toBe(false)
  })
})

describe('billingVarsPresent (the subscription-only guard)', () => {
  it('names every billing var set in the env', () => {
    expect(billingVarsPresent({ ANTHROPIC_API_KEY: 'x', CLAUDE_CODE_USE_BEDROCK: '1' })).toEqual([
      'ANTHROPIC_API_KEY',
      'CLAUDE_CODE_USE_BEDROCK',
    ])
  })
  it('ignores unset and empty vars', () => {
    expect(billingVarsPresent({})).toEqual([])
    expect(billingVarsPresent({ ANTHROPIC_API_KEY: '' })).toEqual([])
    expect(billingVarsPresent({ PATH: 'C:/bin' })).toEqual([])
  })
})
