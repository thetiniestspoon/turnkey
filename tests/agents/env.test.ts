import { describe, it, expect } from 'vitest'
import { isPlaceholder, assertServiceRoleKey } from '../../scripts/agents/lib/env'

describe('isPlaceholder', () => {
  it('flags empty, short, your_, angle-bracket, and non-ascii values', () => {
    expect(isPlaceholder(undefined)).toBe(true)
    expect(isPlaceholder('')).toBe(true)
    expect(isPlaceholder('short')).toBe(true)
    expect(isPlaceholder('your_service_role_key')).toBe(true)
    expect(isPlaceholder('sb_secret_<paste>')).toBe(true)
    expect(isPlaceholder('sb_secret_…aaaaaaaaaaaa')).toBe(true)
  })
  it('accepts a realistic-looking key', () => {
    expect(isPlaceholder('eyJhbGciOiJI' + 'a'.repeat(60))).toBe(false)
  })
})

describe('assertServiceRoleKey', () => {
  it('throws with the dashboard link when key is missing', () => {
    expect(() => assertServiceRoleKey({ SUPABASE_URL: 'https://x.supabase.co' } as NodeJS.ProcessEnv))
      .toThrow(/dashboard\/project\/xebulbfhwyezjrqobzow\/settings\/api/)
  })
  it('throws when url is missing', () => {
    expect(() => assertServiceRoleKey({ SUPABASE_SERVICE_ROLE_KEY: 'eyJ' + 'a'.repeat(60) } as NodeJS.ProcessEnv))
      .toThrow(/SUPABASE_URL/)
  })
  it('returns url+key when both valid', () => {
    const out = assertServiceRoleKey({
      SUPABASE_URL: 'https://xebulbfhwyezjrqobzow.supabase.co',
      SUPABASE_SERVICE_ROLE_KEY: 'eyJhbGciOiJI' + 'a'.repeat(60),
    } as NodeJS.ProcessEnv)
    expect(out.url).toContain('supabase.co')
    expect(out.key.length).toBeGreaterThan(20)
  })
})
