// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { isSimulateStage, runSimulateStage } from '../../scripts/agents/lib/simulate-stage'
import { parseArgs, isAutonomyOff } from '../../scripts/agents/run-nightly'

// Wiring the simulation into the WS3 nightly harness.
//
// The whole point is that this stage runs on a machine with NO credentials. If it ever
// ends up behind assertServiceRoleKey(), a nightly simulate run dies on the exact gate
// that has blocked WS3 since 2026-07-17 — so the ordering is asserted here, in a test,
// rather than left to whoever edits run-nightly.ts next.

describe('stage selection', () => {
  it('recognises --stage=simulate', () => {
    expect(isSimulateStage(parseArgs(['--stage=simulate']).stage)).toBe(true)
  })

  it('does not claim other named stages', () => {
    for (const s of ['scout', 'analyst', 'market-check', 'tracker']) {
      expect(isSimulateStage(parseArgs([`--stage=${s}`]).stage)).toBe(false)
    }
  })

  it('does not run on a bare nightly invocation — simulate is opt-in', () => {
    // A full nightly run writes to the database. The simulation is a separate,
    // credential-free job; folding it into the default run would couple the two.
    expect(isSimulateStage(parseArgs([]).stage)).toBe(false)
  })
})

describe('the simulate stage runs credential-free', () => {
  it('completes with an environment holding no Supabase key at all', async () => {
    const code = await runSimulateStage({ env: {}, log: () => {} })
    expect(code).toBe(0)
  })

  it('prints the calibration score', async () => {
    const lines: string[] = []
    await runSimulateStage({ env: {}, log: (m) => lines.push(m) })
    expect(lines.join('\n')).toMatch(/Brier score, uncalibrated/)
  })

  it('discloses that the corpus is synthetic', async () => {
    const lines: string[] = []
    await runSimulateStage({ env: {}, log: (m) => lines.push(m) })
    expect(lines.join('\n')).toMatch(/SYNTHETIC/)
  })

  it('keeps the billing guard in the path', async () => {
    const lines: string[] = []
    await runSimulateStage({ env: { ANTHROPIC_API_KEY: 'present-but-unused' }, log: (m) => lines.push(m) })
    expect(lines.join('\n')).toMatch(/ANTHROPIC_API_KEY/)
  })

  it('never echoes the value of a billing variable it warns about', async () => {
    const lines: string[] = []
    await runSimulateStage({ env: { ANTHROPIC_API_KEY: 'sk-should-never-be-printed' }, log: (m) => lines.push(m) })
    expect(lines.join('\n')).not.toContain('sk-should-never-be-printed')
  })

  it('honours the kill switch', async () => {
    const lines: string[] = []
    const code = await runSimulateStage({ env: { TURNKEY_AUTONOMY_OFF: '1' }, log: (m) => lines.push(m) })
    expect(code).toBe(0)
    expect(lines.join('\n')).toMatch(/AUTONOMY_OFF/)
    expect(lines.join('\n')).not.toMatch(/Brier/)
  })

  it('agrees with run-nightly on what the kill switch looks like', () => {
    expect(isAutonomyOff({ TURNKEY_AUTONOMY_OFF: '1' })).toBe(true)
    expect(isAutonomyOff({})).toBe(false)
  })
})

describe('run-nightly.ts orders the simulate stage before the credential gate', () => {
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../scripts/agents/run-nightly.ts'), 'utf8',
  )

  it('calls the simulate stage earlier in the file than assertServiceRoleKey', () => {
    const simulateAt = source.indexOf('runSimulateStage')
    const assertAt = source.indexOf('assertServiceRoleKey(process.env)')
    expect(simulateAt).toBeGreaterThan(-1)
    expect(assertAt).toBeGreaterThan(-1)
    expect(simulateAt).toBeLessThan(assertAt)
  })

  it('returns from the simulate branch rather than falling through to the DB stages', () => {
    const branch = source.slice(source.indexOf('runSimulateStage') - 400, source.indexOf('assertServiceRoleKey(process.env)'))
    expect(branch).toMatch(/return\s+/)
  })
})
