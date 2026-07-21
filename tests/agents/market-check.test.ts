import { describe, it, expect } from 'vitest'
import { parseMarketCheckOutput, wentInactive } from '../../scripts/agents/lib/market-check'

describe('parseMarketCheckOutput', () => {
  it('validates status enum + price_current + notes', () => {
    const o = parseMarketCheckOutput('{"status":"active","price_current":250000,"notes":"still listed"}')
    expect(o.status).toBe('active'); expect(o.price_current).toBe(250000)
  })
  it('accepts null price', () => {
    expect(parseMarketCheckOutput('{"status":"sold","price_current":null,"notes":"closed"}').price_current).toBeNull()
  })
  it('throws on an invalid status', () => {
    expect(() => parseMarketCheckOutput('{"status":"foo","price_current":null,"notes":""}')).toThrow()
  })
})

describe('wentInactive', () => {
  it('is true active/null → off_market|sold', () => {
    expect(wentInactive('active', 'sold')).toBe(true)
    expect(wentInactive(null, 'off_market')).toBe(true)
  })
  it('is false otherwise', () => {
    expect(wentInactive('active', 'active')).toBe(false)
    expect(wentInactive('sold', 'sold')).toBe(false)
    expect(wentInactive('active', 'pending')).toBe(false)
  })
})
