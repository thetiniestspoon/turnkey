// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { mulberry32, seedFromString, shuffled, splitByHash } from '../../scripts/sim/lib/rng'

describe('mulberry32', () => {
  it('produces the same sequence for the same seed', () => {
    const a = mulberry32(20260721)
    const b = mulberry32(20260721)
    const seqA = [a(), a(), a(), a(), a()]
    const seqB = [b(), b(), b(), b(), b()]
    expect(seqA).toEqual(seqB)
  })

  it('produces a different sequence for a different seed', () => {
    const a = mulberry32(1)
    const b = mulberry32(2)
    expect([a(), a(), a()]).not.toEqual([b(), b(), b()])
  })

  it('stays inside [0, 1)', () => {
    const r = mulberry32(99)
    for (let i = 0; i < 500; i++) {
      const v = r()
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThan(1)
    }
  })
})

describe('seedFromString', () => {
  it('is deterministic', () => {
    expect(seedFromString('trenton')).toBe(seedFromString('trenton'))
  })

  it('separates different strings', () => {
    expect(seedFromString('trenton')).not.toBe(seedFromString('camden'))
  })

  it('returns a non-negative 32-bit integer', () => {
    const s = seedFromString('any corpus id 2026')
    expect(Number.isInteger(s)).toBe(true)
    expect(s).toBeGreaterThanOrEqual(0)
    expect(s).toBeLessThan(2 ** 32)
  })
})

describe('shuffled', () => {
  it('is a permutation of the input and leaves the input untouched', () => {
    const input = [1, 2, 3, 4, 5, 6, 7, 8]
    const out = shuffled(input, mulberry32(7))
    expect([...out].sort((a, b) => a - b)).toEqual(input)
    expect(input).toEqual([1, 2, 3, 4, 5, 6, 7, 8])
  })

  it('gives the same order for the same seed', () => {
    const input = ['a', 'b', 'c', 'd', 'e']
    expect(shuffled(input, mulberry32(3))).toEqual(shuffled(input, mulberry32(3)))
  })
})

describe('splitByHash', () => {
  it('assigns every id to exactly one side', () => {
    const ids = Array.from({ length: 60 }, (_, i) => `prop-${i}`)
    const { fit, holdout } = splitByHash(ids, 20260721)
    expect(fit.length + holdout.length).toBe(60)
    expect(new Set([...fit, ...holdout]).size).toBe(60)
  })

  it('is stable across calls — the same id always lands on the same side', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `prop-${i}`)
    expect(splitByHash(ids, 5)).toEqual(splitByHash(ids, 5))
  })

  it('does not depend on the order ids are presented in', () => {
    const ids = Array.from({ length: 40 }, (_, i) => `prop-${i}`)
    const forward = splitByHash(ids, 5)
    const backward = splitByHash([...ids].reverse(), 5)
    expect([...backward.fit].sort()).toEqual([...forward.fit].sort())
  })

  it('splits roughly in half', () => {
    const ids = Array.from({ length: 200 }, (_, i) => `prop-${i}`)
    const { fit } = splitByHash(ids, 11)
    expect(fit.length).toBeGreaterThan(70)
    expect(fit.length).toBeLessThan(130)
  })
})
