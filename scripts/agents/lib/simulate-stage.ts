import path from 'node:path'
import { billingVarsPresent } from './claude'
import { loadCorpus } from '../../sim/lib/corpus'
import { runBacktest } from '../../sim/lib/backtest'
import { renderTextReport } from '../../sim/lib/report'
import { resolveSource, loadLiveObservations, LIVE_SOURCE_ENV_VAR } from '../../sim/lib/source'

// The bridge between the WS3 nightly harness and the offline simulation layer.
//
// Deliberately thin, and deliberately placed BEFORE assertServiceRoleKey() in
// run-nightly.ts. The simulation needs no database, so making it wait on the
// service-role key that has blocked WS3 since 2026-07-17 would mean the one stage
// that CAN run tonight is the one stage that doesn't.
//
// Cost: this stage spawns no `claude` subprocess and makes no network call, so a
// nightly simulate run is $0 under the subscription and cannot be rate-limited.
// There is no "quiet night" path here because there is nothing to be quiet about.

export const CORPUS_DIR = 'tests/fixtures/sim/synthetic-trenton-2026q2'
export const SIM_SEED = 20260721

export function isSimulateStage(stage: string | null): boolean {
  return stage === 'simulate'
}

export async function runSimulateStage(deps: {
  env: NodeJS.ProcessEnv
  log?: (msg: string) => void
  corpusDir?: string
  seed?: number
}): Promise<number> {
  const log = deps.log ?? console.log
  const env = deps.env

  // Kill switch, same semantics as the rest of the harness.
  if (env.TURNKEY_AUTONOMY_OFF && env.TURNKEY_AUTONOMY_OFF.length > 0) {
    log('   TURNKEY_AUTONOMY_OFF set — skipping the simulate stage. Exit 0.')
    return 0
  }

  // Billing guard stays in the path. This stage cannot incur token spend, but a
  // billing var in the scheduler's environment is a misconfiguration that WILL bite
  // the stages that do spawn claude — so it is named wherever it is seen. Only the
  // variable NAMES are printed, never their values.
  const billing = billingVarsPresent(env)
  if (billing.length) {
    log(`   ⚠ ${billing.join(', ')} present in the environment — this stage spawns no LLM, so it is unaffected. Fix it at the source.`)
  }

  if (resolveSource(env) === 'live') {
    await loadLiveObservations()   // throws, naming the one remaining operator step
    return 1
  }

  const dir = deps.corpusDir ?? path.resolve(process.cwd(), CORPUS_DIR)
  log(`   simulate: fixture replay from ${CORPUS_DIR} (${LIVE_SOURCE_ENV_VAR} not set — no network, no credentials, $0)`)

  const corpus = loadCorpus(dir)
  const result = runBacktest({ corpus, seed: deps.seed ?? SIM_SEED })
  log(renderTextReport(result))
  return 0
}
