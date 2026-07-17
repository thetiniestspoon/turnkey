import { describe, it, expect } from 'vitest'
import { parseArgs, isAutonomyOff, selectActiveWatchlists, CAPS } from '../../scripts/agents/run-nightly'

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
