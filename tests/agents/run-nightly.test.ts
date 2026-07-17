import { describe, it, expect } from 'vitest'
import { parseArgs, isAutonomyOff, selectActiveWatchlists, candidateKey, CAPS } from '../../scripts/agents/run-nightly'

describe('parseArgs', () => {
  it('defaults to a full live run', () => {
    expect(parseArgs([])).toEqual({ dryRun: false, stage: null, watchlist: null })
  })
  it('parses --dry-run, --stage=, --watchlist=', () => {
    expect(parseArgs(['--dry-run', '--stage=scout', '--watchlist=abc'])).toEqual({
      dryRun: true, stage: 'scout', watchlist: 'abc',
    })
  })
})

describe('isAutonomyOff', () => {
  it('is true only when the kill switch is a non-empty value', () => {
    expect(isAutonomyOff({} as NodeJS.ProcessEnv)).toBe(false)
    expect(isAutonomyOff({ TURNKEY_AUTONOMY_OFF: '' } as NodeJS.ProcessEnv)).toBe(false)
    expect(isAutonomyOff({ TURNKEY_AUTONOMY_OFF: '1' } as NodeJS.ProcessEnv)).toBe(true)
  })
})

describe('selectActiveWatchlists', () => {
  it('keeps only active and caps to N', () => {
    const rows = [
      { id: 'a', active: true }, { id: 'b', active: false },
      { id: 'c', active: true }, { id: 'd', active: true }, { id: 'e', active: true },
    ]
    const out = selectActiveWatchlists(rows, CAPS.watchlists)
    expect(out.map((r) => r.id)).toEqual(['a', 'c', 'd'])
  })
})

describe('candidateKey', () => {
  it('scopes dedup per-user so two users sharing a zip both get a shot at the same property', () => {
    const seen = new Set<string>()
    const userA = 'user-a', userB = 'user-b', propertyId = 'prop-1'

    seen.add(candidateKey(userA, propertyId))
    // User A already saw this property this run — skipped.
    expect(seen.has(candidateKey(userA, propertyId))).toBe(true)
    // User B, sharing the same zip, has NOT — must still be evaluated.
    expect(seen.has(candidateKey(userB, propertyId))).toBe(false)
  })

  it('still dedups the same user against the same property', () => {
    expect(candidateKey('user-a', 'prop-1')).toBe(candidateKey('user-a', 'prop-1'))
  })
})
