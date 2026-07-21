// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { runBacktest } from '../../scripts/sim/lib/backtest'
import { generateCorpus } from '../../scripts/sim/lib/generate'
import { parseCorpus } from '../../scripts/sim/lib/corpus'
import { DEFAULT_POLICY } from '../../scripts/sim/lib/policy'

const corpus = parseCorpus(generateCorpus({ seed: 20260721, count: 60 }))

describe('runBacktest — reproducibility', () => {
  it('returns an identical result for the same corpus and seed', () => {
    expect(runBacktest({ corpus, seed: 20260721 })).toEqual(runBacktest({ corpus, seed: 20260721 }))
  })

  it('produces a run id that changes with the seed', () => {
    const a = runBacktest({ corpus, seed: 1 })
    const b = runBacktest({ corpus, seed: 2 })
    expect(a.run_id).not.toBe(b.run_id)
  })

  it('produces a run id that changes with the policy', () => {
    const strict = { ...DEFAULT_POLICY, confidence_floor: 90 }
    const a = runBacktest({ corpus, seed: 1 })
    const b = runBacktest({ corpus, seed: 1, policy: strict })
    expect(a.run_id).not.toBe(b.run_id)
  })
})

describe('runBacktest — split discipline', () => {
  const r = runBacktest({ corpus, seed: 20260721 })

  it('assigns every property to exactly one of fit or holdout', () => {
    expect(r.split_sizes.fit + r.split_sizes.holdout).toBe(60)
  })

  it('puts a usable number of properties on each side', () => {
    expect(r.split_sizes.fit).toBeGreaterThan(15)
    expect(r.split_sizes.holdout).toBeGreaterThan(15)
  })

  it('fits the calibration map only on the fit half', () => {
    expect(r.calibration.fitted_from).toMatch(/fit/i)
    const fittedN = r.calibration.buckets.reduce((acc, b) => acc + b.n, 0)
    expect(fittedN).toBe(r.split_sizes.fit)
  })

  it('reports the headline score on the holdout half', () => {
    expect(r.headline.evaluated_on).toBe('holdout')
    expect(r.headline.n).toBe(r.split_sizes.holdout)
  })
})

describe('runBacktest — scoring', () => {
  const r = runBacktest({ corpus, seed: 20260721 })

  it('produces a finite Brier score in [0, 1]', () => {
    expect(Number.isFinite(r.headline.brier_uncalibrated)).toBe(true)
    expect(r.headline.brier_uncalibrated).toBeGreaterThanOrEqual(0)
    expect(r.headline.brier_uncalibrated).toBeLessThanOrEqual(1)
  })

  it('produces a calibrated Brier score and a signed delta between them', () => {
    expect(Number.isFinite(r.headline.brier_calibrated)).toBe(true)
    expect(r.headline.delta).toBeCloseTo(r.headline.brier_uncalibrated - r.headline.brier_calibrated, 12)
  })

  it('detects the planted renovation underestimate as a negative signed bias', () => {
    const reno = r.metric_errors.renovation_cost
    expect(reno.bias_pct).toBeLessThan(-5)
  })

  it('does not flag ARV, which was generated roughly unbiased', () => {
    expect(Math.abs(r.metric_errors.arv.bias_pct)).toBeLessThan(5)
  })

  it('records a decision for every property in the corpus', () => {
    expect(r.ledger).toHaveLength(60)
  })

  it('labels every ledger row with the split it belongs to', () => {
    expect(r.ledger.every((row) => row.split === 'fit' || row.split === 'holdout')).toBe(true)
  })

  it('carries the confusion matrix over the holdout decisions', () => {
    const c = r.confusion
    expect(c.hit + c.false_buy + c.miss + c.correct_pass).toBe(r.split_sizes.holdout)
  })
})

describe('runBacktest — provenance', () => {
  const r = runBacktest({ corpus, seed: 20260721 })

  it('carries the corpus synthetic flag through to the result', () => {
    expect(r.corpus.synthetic).toBe(true)
  })

  it('carries the planted biases through, so a report can disclose them', () => {
    expect(r.corpus.planted_biases.length).toBeGreaterThan(0)
  })

  it('dates itself from the corpus, never from the wall clock', () => {
    expect(r.as_of).toBe(corpus.manifest.as_of)
  })
})
