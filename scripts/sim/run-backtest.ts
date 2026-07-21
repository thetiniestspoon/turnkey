import fs from 'node:fs'
import path from 'node:path'
import { loadCorpus } from './lib/corpus'
import { runBacktest } from './lib/backtest'
import { renderTextReport, renderJsonReport } from './lib/report'
import { resolveSource, loadLiveObservations, LIVE_SOURCE_ENV_VAR } from './lib/source'
import { billingVarsPresent } from '../agents/lib/claude'

// The backtest CLI.
//
//   npx tsx scripts/sim/run-backtest.ts [--corpus=DIR] [--seed=N] [--json=FILE]
//
// Runs entirely offline: reads JSON, computes, prints. It spawns no subprocess, opens
// no socket, and requires no credential — which is why it can run nightly under the
// Claude Code subscription at exactly $0 and can never be rate-limited.

export const DEFAULT_CORPUS = 'tests/fixtures/sim/synthetic-trenton-2026q2'
export const DEFAULT_SEED = 20260721

export function parseArgs(argv: string[]): { corpus: string; seed: number; json: string | null } {
  let corpus = DEFAULT_CORPUS, seed = DEFAULT_SEED, json: string | null = null
  for (const a of argv) {
    if (a.startsWith('--corpus=')) corpus = a.slice('--corpus='.length)
    else if (a.startsWith('--seed=')) seed = Number(a.slice('--seed='.length))
    else if (a.startsWith('--json=')) json = a.slice('--json='.length)
  }
  return { corpus, seed, json }
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  const args = parseArgs(argv)

  // Billing guard, carried over from the WS3 nightly harness. This CLI never spawns
  // claude, so these vars cannot affect it — but a billing var sitting in the
  // scheduler's environment is a misconfiguration worth naming out loud wherever it
  // is seen, because the stage that DOES spawn claude sits next to this one.
  const billing = billingVarsPresent(process.env)
  if (billing.length) {
    console.log(`   ⚠ ${billing.join(', ')} present in the environment. This stage spawns no LLM, so it is unaffected — but fix it at the source.`)
  }

  // ── the live seam ──────────────────────────────────────────────────────────
  if (resolveSource(process.env) === 'live') {
    // Throws with the one remaining operator step named. Deliberate: setting the flag
    // must not silently half-work.
    await loadLiveObservations()
    return 1
  }
  console.log(`   source: fixture replay (${LIVE_SOURCE_ENV_VAR} not set — no network, no credentials)`)

  const corpus = loadCorpus(args.corpus)
  const result = runBacktest({ corpus, seed: args.seed })

  console.log(renderTextReport(result))

  if (args.json) {
    fs.mkdirSync(path.dirname(args.json), { recursive: true })
    fs.writeFileSync(args.json, `${renderJsonReport(result)}\n`, 'utf8')
    console.log(`\nwrote ${args.json}`)
  }
  return 0
}

const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('run-backtest.ts')
if (invokedDirectly) {
  main().then((c) => process.exit(c)).catch((e) => { console.error(String((e as Error).message ?? e)); process.exit(1) })
}
