// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { stableStringify, hashObject, computeRunId, ENGINE_VERSION } from '../../scripts/sim/lib/ledger'

describe('stableStringify', () => {
  it('serialises the same object identically regardless of key order', () => {
    expect(stableStringify({ a: 1, b: 2 })).toBe(stableStringify({ b: 2, a: 1 }))
  })

  it('sorts keys at every depth, not just the top level', () => {
    expect(stableStringify({ x: { p: 1, q: 2 } })).toBe(stableStringify({ x: { q: 2, p: 1 } }))
  })

  it('preserves array order, which is meaningful', () => {
    expect(stableStringify([1, 2, 3])).not.toBe(stableStringify([3, 2, 1]))
  })

  it('distinguishes objects that differ in value', () => {
    expect(stableStringify({ a: 1 })).not.toBe(stableStringify({ a: 2 }))
  })
})

describe('hashObject', () => {
  it('is a 64-character hex digest', () => {
    expect(hashObject({ a: 1 })).toMatch(/^[0-9a-f]{64}$/)
  })

  it('is stable across key orderings', () => {
    expect(hashObject({ a: 1, b: [1, 2] })).toBe(hashObject({ b: [1, 2], a: 1 }))
  })

  it('changes when any value changes', () => {
    expect(hashObject({ a: 1 })).not.toBe(hashObject({ a: 1.0001 }))
  })
})

describe('computeRunId', () => {
  const args = { corpusHash: 'abc', seed: 20260721, policyHash: 'def' }

  it('is reproducible from the same inputs', () => {
    expect(computeRunId(args)).toBe(computeRunId(args))
  })

  it('changes when the seed changes', () => {
    expect(computeRunId(args)).not.toBe(computeRunId({ ...args, seed: 1 }))
  })

  it('changes when the corpus changes', () => {
    expect(computeRunId(args)).not.toBe(computeRunId({ ...args, corpusHash: 'zzz' }))
  })

  it('changes when the policy changes', () => {
    expect(computeRunId(args)).not.toBe(computeRunId({ ...args, policyHash: 'zzz' }))
  })

  it('binds the engine version, so a scoring-logic change cannot silently reuse a run id', () => {
    const withVersion = computeRunId(args)
    const other = computeRunId({ ...args, engineVersion: `${ENGINE_VERSION}-modified` })
    expect(other).not.toBe(withVersion)
  })
})
