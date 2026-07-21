// @vitest-environment node
import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { loadCorpus } from '../../scripts/sim/lib/corpus'
import { runBacktest } from '../../scripts/sim/lib/backtest'
import { renderTextReport } from '../../scripts/sim/lib/report'
import { generateCorpus } from '../../scripts/sim/lib/generate'
import { DEFAULT_SEED, DEFAULT_COUNT } from '../../scripts/sim/generate-corpus'

// THE GOLDEN TEST.
//
// This is the test that makes the deliverable a deliverable: `npm test` replays the
// checked-in fixture corpus and prints the calibration score. If the number moves,
// this fails — so the score in the report can be trusted to be the score the code
// produces, not one someone typed into a document once.
//
// The pinned values below were RECORDED from the first correct run, not predicted.
// That is the honest use of a golden test: it locks behaviour against drift, it does
// not claim the numbers were derived from theory.

const CORPUS_DIR = path.resolve(__dirname, '../fixtures/sim/synthetic-trenton-2026q2')

const GOLDEN = {
  run_id: 'fbb22a871142cf44ed602e2bd2474fe0327b5d0f1e28f0ede6de7b89fc0bf7f2',
  corpus_hash: '2bb4294db7882a433e9a5ba7b469a87b6081a719d94d56f95588f608b82837b4',
  brier_uncalibrated: 0.2451,
  brier_calibrated: 0.22852279889674226,
  brier_skill_score: 0.01142999999999983,
  base_rate: 0.45454545454545453,
  split: { fit: 27, holdout: 33 },
  renovation_bias_pct: -26.18310589803936,
}

const corpus = loadCorpus(CORPUS_DIR)
const result = runBacktest({ corpus, seed: DEFAULT_SEED })

describe('the checked-in fixture corpus', () => {
  it('is labelled synthetic', () => {
    expect(corpus.manifest.synthetic).toBe(true)
  })

  it('holds the expected number of properties', () => {
    expect(corpus.observations).toHaveLength(DEFAULT_COUNT)
  })

  it('regenerates byte-identically from its seed', () => {
    // The corpus on disk must be exactly what the generator produces from the seed in
    // its own manifest. If someone hand-edits a fixture, this catches it.
    const regenerated = generateCorpus({ seed: corpus.manifest.seed, count: DEFAULT_COUNT })
    for (const [file, value] of [
      ['manifest.json', regenerated.manifest],
      ['properties.json', regenerated.properties],
      ['analyses.json', regenerated.analyses],
      ['outcomes.json', regenerated.outcomes],
      ['policy.json', regenerated.policy],
    ] as const) {
      const onDisk = fs.readFileSync(path.join(CORPUS_DIR, file), 'utf8')
      expect(onDisk, `${file} differs from what the seed regenerates`).toBe(`${JSON.stringify(value, null, 2)}\n`)
    }
  })

  it('hashes to the pinned corpus hash', () => {
    expect(corpus.corpusHash).toBe(GOLDEN.corpus_hash)
  })
})

describe('the backtest is reproducible from (fixture, seed) alone', () => {
  it('produces the pinned run id', () => {
    expect(result.run_id).toBe(GOLDEN.run_id)
  })

  it('produces the pinned calibration score', () => {
    expect(result.headline.brier_uncalibrated).toBe(GOLDEN.brier_uncalibrated)
    expect(result.headline.brier_calibrated).toBe(GOLDEN.brier_calibrated)
    expect(result.headline.brier_skill_score).toBe(GOLDEN.brier_skill_score)
  })

  it('produces the pinned base rate and split', () => {
    expect(result.headline.base_rate).toBe(GOLDEN.base_rate)
    expect(result.split_sizes).toEqual(GOLDEN.split)
  })

  it('produces the pinned renovation bias', () => {
    expect(result.metric_errors.renovation_cost.bias_pct).toBe(GOLDEN.renovation_bias_pct)
  })

  it('produces an identical result on a second run in the same process', () => {
    expect(runBacktest({ corpus, seed: DEFAULT_SEED })).toEqual(result)
  })

  it('produces an identical result from a freshly loaded corpus', () => {
    expect(runBacktest({ corpus: loadCorpus(CORPUS_DIR), seed: DEFAULT_SEED })).toEqual(result)
  })
})

describe('npm test prints the calibration score', () => {
  it('prints the full report to stdout', () => {
    // Requires --disable-console-intercept, which package.json's test script sets.
    console.log(`\n${renderTextReport(result)}\n`)
    expect(renderTextReport(result)).toContain('Brier score, uncalibrated')
  })
})
