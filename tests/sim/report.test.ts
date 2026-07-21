// @vitest-environment node
import { describe, it, expect } from 'vitest'
import { renderTextReport } from '../../scripts/sim/lib/report'
import { runBacktest } from '../../scripts/sim/lib/backtest'
import { generateCorpus } from '../../scripts/sim/lib/generate'
import { parseCorpus } from '../../scripts/sim/lib/corpus'

const corpus = parseCorpus(generateCorpus({ seed: 20260721, count: 60 }))
const result = runBacktest({ corpus, seed: 20260721 })
const text = renderTextReport(result)

describe('renderTextReport — disclosure', () => {
  it('shouts that the corpus is synthetic', () => {
    expect(text).toMatch(/SYNTHETIC/)
  })

  it('discloses the planted biases rather than presenting findings as discoveries', () => {
    for (const bias of result.corpus.planted_biases) expect(text).toContain(bias)
  })

  it('prints the run id so the number can be traced back to an exact run', () => {
    expect(text).toContain(result.run_id.slice(0, 12))
  })
})

describe('renderTextReport — the calibration number', () => {
  it('prints the headline Brier score', () => {
    expect(text).toMatch(/Brier/)
    expect(text).toContain(result.headline.brier_uncalibrated.toFixed(4))
  })

  it('prints the calibrated score and the delta', () => {
    expect(text).toContain(result.headline.brier_calibrated.toFixed(4))
  })

  it('says which half it was evaluated on', () => {
    expect(text).toMatch(/holdout/i)
  })
})

describe('renderTextReport — where the model was wrong', () => {
  it('names the worst-calibrated confidence bucket', () => {
    expect(text).toMatch(/worst-calibrated|Worst-calibrated/)
  })

  it('names the metric with the largest signed bias', () => {
    expect(text).toMatch(/renovation_cost/)
  })

  it('states the direction of that bias in words, not just a sign', () => {
    expect(text).toMatch(/under-forecast|over-forecast/)
  })

  it('lists the costliest false buys', () => {
    expect(text).toMatch(/false buy|False buy|Costliest/i)
  })

  it('breaks false buys down by terminal status', () => {
    expect(text).toMatch(/sold|off_market|pending|active/)
  })
})

describe('renderTextReport — reproducibility', () => {
  it('is byte-identical for the same result', () => {
    expect(renderTextReport(result)).toBe(text)
  })

  it('contains no wall-clock timestamp — it dates itself from the corpus', () => {
    expect(text).toContain(result.as_of)
  })
})
