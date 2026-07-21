// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { liveSourceEnabled, resolveSource, loadLiveObservations, LIVE_SOURCE_ENV_VAR } from '../../scripts/sim/lib/source'

describe('liveSourceEnabled', () => {
  it('is false when the flag is absent — the default on every machine today', () => {
    expect(liveSourceEnabled({})).toBe(false)
  })

  it('is false for an empty string', () => {
    expect(liveSourceEnabled({ [LIVE_SOURCE_ENV_VAR]: '' })).toBe(false)
  })

  it('is false for whitespace only', () => {
    expect(liveSourceEnabled({ [LIVE_SOURCE_ENV_VAR]: '   ' })).toBe(false)
  })

  it('is true for any non-empty value — presence is the whole check', () => {
    expect(liveSourceEnabled({ [LIVE_SOURCE_ENV_VAR]: '1' })).toBe(true)
    expect(liveSourceEnabled({ [LIVE_SOURCE_ENV_VAR]: 'yes' })).toBe(true)
  })
})

describe('resolveSource', () => {
  it('resolves to the fixture corpus when the flag is absent', () => {
    expect(resolveSource({})).toBe('fixture')
  })

  it('resolves to live only when the flag is present', () => {
    expect(resolveSource({ [LIVE_SOURCE_ENV_VAR]: '1' })).toBe('live')
  })
})

describe('loadLiveObservations', () => {
  it('throws rather than silently returning nothing — the seam is not wired yet', async () => {
    await expect(loadLiveObservations()).rejects.toThrow()
  })

  it('names the one remaining step in the error', async () => {
    await expect(loadLiveObservations()).rejects.toThrow(/SUPABASE_SERVICE_ROLE_KEY/)
  })

  it('carries no pasteable secret-shaped placeholder in its message', async () => {
    const err = await loadLiveObservations().catch((e: Error) => e)
    const msg = String((err as Error).message)
    // House rule: a command or message must never contain something that reads as
    // "replace this with your key" — that is precisely how a live key got pasted
    // into a transcript on 2026-07-12.
    expect(msg).not.toMatch(/sb_secret|eyJ[A-Za-z0-9]/)
    expect(msg).not.toMatch(/<[^>]*key[^>]*>/i)
    expect(msg).not.toMatch(/\.\.\.|…/)
  })
})
