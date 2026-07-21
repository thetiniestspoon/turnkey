// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { generateCorpus, deterministicUuid } from '../../scripts/sim/lib/generate'
import { mulberry32 } from '../../scripts/sim/lib/rng'
import { parseCorpus } from '../../scripts/sim/lib/corpus'
import { analystOutputSchema } from '../../src/schemas/analyst-output'

describe('deterministicUuid', () => {
  it('produces a v4-shaped uuid that the production analyst schema accepts', () => {
    const id = deterministicUuid(mulberry32(1))
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  })

  it('is reproducible from the same seed', () => {
    expect(deterministicUuid(mulberry32(42))).toBe(deterministicUuid(mulberry32(42)))
  })

  it('differs across draws from one stream', () => {
    const r = mulberry32(42)
    expect(deterministicUuid(r)).not.toBe(deterministicUuid(r))
  })
})

describe('generateCorpus — determinism', () => {
  it('produces identical output for the same seed', () => {
    expect(generateCorpus({ seed: 20260721, count: 12 })).toEqual(generateCorpus({ seed: 20260721, count: 12 }))
  })

  it('produces different output for a different seed', () => {
    const a = generateCorpus({ seed: 1, count: 12 })
    const b = generateCorpus({ seed: 2, count: 12 })
    expect(a.properties).not.toEqual(b.properties)
  })
})

describe('generateCorpus — shape', () => {
  const c = generateCorpus({ seed: 20260721, count: 30 })

  it('generates the requested number of properties with unique ids', () => {
    expect(c.properties).toHaveLength(30)
    expect(new Set(c.properties.map((p) => p.id)).size).toBe(30)
  })

  it('produces one analysis and one outcome per property', () => {
    expect(c.analyses).toHaveLength(30)
    expect(c.outcomes).toHaveLength(30)
  })

  it('produces analyses that satisfy the PRODUCTION analyst schema', () => {
    // The fixture is only useful if it is shaped like what the real analyst emits.
    for (const a of c.analyses) expect(() => analystOutputSchema.parse(a)).not.toThrow()
  })

  it('loads cleanly through the ordinary corpus parser', () => {
    expect(() => parseCorpus(c)).not.toThrow()
  })

  it('is labelled synthetic in the manifest', () => {
    expect(c.manifest.synthetic).toBe(true)
    expect(c.manifest.planted_biases.length).toBeGreaterThan(0)
  })
})

describe('generateCorpus — the planted biases are actually present', () => {
  // A fixture corpus with no bias in it would give the harness nothing to detect, and
  // a passing calibration run would prove nothing. These tests assert the corpus is
  // genuinely miscalibrated in the two ways the manifest claims.
  const c = generateCorpus({ seed: 20260721, count: 60 })
  const outcomeById = new Map(c.outcomes.map((o) => [o.property_id, o]))

  it('underestimates renovation cost on average', () => {
    let predicted = 0, actual = 0
    for (const a of c.analyses) {
      predicted += a.flip.renovation_est
      actual += outcomeById.get(a.property_id)!.actuals.renovation_cost
    }
    expect(predicted).toBeLessThan(actual)
    // and not trivially — a bias worth detecting
    expect(predicted / actual).toBeLessThan(0.9)
  })

  it('is roughly unbiased on ARV, so the harness must distinguish the two', () => {
    let predicted = 0, actual = 0
    for (const a of c.analyses) {
      predicted += a.flip.arv
      actual += outcomeById.get(a.property_id)!.actuals.arv
    }
    const ratio = predicted / actual
    expect(ratio).toBeGreaterThan(0.95)
    expect(ratio).toBeLessThan(1.05)
  })

  it('emits high confidences often enough to populate the top buckets', () => {
    const high = c.analyses.filter((a) => a.overall_confidence >= 70)
    expect(high.length).toBeGreaterThan(10)
  })
})
