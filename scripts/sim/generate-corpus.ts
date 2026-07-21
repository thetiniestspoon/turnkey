import fs from 'node:fs'
import path from 'node:path'
import { generateCorpus } from './lib/generate'

// Regenerates the checked-in synthetic fixture corpus.
//
// The OUTPUT is the artefact — it is committed, and the harness replays it. This
// script exists so the corpus is auditable (you can see exactly how it was made and
// reproduce it) rather than a pile of hand-written JSON nobody can vouch for.
//
//   npx tsx scripts/sim/generate-corpus.ts [--seed=N] [--count=N] [--out=DIR]
//
// Same seed in, byte-identical files out. tests/sim/golden.test.ts asserts it.

export const DEFAULT_OUT = 'tests/fixtures/sim/synthetic-trenton-2026q2'
export const DEFAULT_SEED = 20260721
export const DEFAULT_COUNT = 60

export function parseArgs(argv: string[]): { seed: number; count: number; out: string } {
  let seed = DEFAULT_SEED, count = DEFAULT_COUNT, out = DEFAULT_OUT
  for (const a of argv) {
    if (a.startsWith('--seed=')) seed = Number(a.slice('--seed='.length))
    else if (a.startsWith('--count=')) count = Number(a.slice('--count='.length))
    else if (a.startsWith('--out=')) out = a.slice('--out='.length)
  }
  return { seed, count, out }
}

// Trailing newline and 2-space indent, always — so a regenerated corpus diffs cleanly
// against the committed one instead of showing a whole-file change.
export function writeJson(dir: string, file: string, value: unknown): void {
  fs.writeFileSync(path.join(dir, file), `${JSON.stringify(value, null, 2)}\n`, 'utf8')
}

export function writeCorpus(dir: string, seed: number, count: number): void {
  const c = generateCorpus({ seed, count })
  fs.mkdirSync(dir, { recursive: true })
  writeJson(dir, 'manifest.json', c.manifest)
  writeJson(dir, 'properties.json', c.properties)
  writeJson(dir, 'analyses.json', c.analyses)
  writeJson(dir, 'outcomes.json', c.outcomes)
  writeJson(dir, 'policy.json', c.policy)
}

function main(): number {
  const { seed, count, out } = parseArgs(process.argv.slice(2))
  writeCorpus(out, seed, count)
  console.log(`Wrote SYNTHETIC corpus: ${count} properties, seed ${seed} -> ${out}`)
  console.log('This corpus contains deliberately planted biases. See manifest.json.')
  return 0
}

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('generate-corpus.ts')
if (invokedDirectly) process.exit(main())
