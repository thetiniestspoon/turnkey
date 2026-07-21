import { createHash } from 'node:crypto'
import type { Decision } from '@/schemas/simulation'
import type { Resolution } from './outcome'

// Reproducibility.
//
// A backtest result that cannot be regenerated is an anecdote. Every run is
// identified by a hash of everything that could change its output — the corpus, the
// seed, the policy, and the engine version — so "the calibration was 0.19" is a
// checkable claim rather than a memory.
//
// ENGINE_VERSION is bound into the run id deliberately: if the scoring logic changes,
// the same corpus and seed MUST produce a different run id, or an old number and a
// new number end up filed under the same name.
export const ENGINE_VERSION = '1.0.0'

// JSON.stringify does not guarantee key order across constructions of an equivalent
// object, so hashing its output directly would produce unstable digests.
export function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.keys(value as Record<string, unknown>)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stableStringify((value as Record<string, unknown>)[k])}`)
  return `{${entries.join(',')}}`
}

export function hashObject(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex')
}

export function computeRunId(args: {
  corpusHash: string
  seed: number
  policyHash: string
  engineVersion?: string
}): string {
  return hashObject({
    corpus: args.corpusHash,
    seed: args.seed,
    policy: args.policyHash,
    engine: args.engineVersion ?? ENGINE_VERSION,
  })
}

// One row per property per run: what was decided, and what actually happened.
export type LedgerRecord = Decision & {
  run_id: string
  split: 'fit' | 'holdout'
  realized_return: number
  cleared: boolean
  shortfall: number
  terminal_status: Resolution['terminal_status']
}

export function buildLedgerRecord(args: {
  runId: string
  split: 'fit' | 'holdout'
  decision: Decision
  resolution: Resolution
}): LedgerRecord {
  return {
    ...args.decision,
    run_id: args.runId,
    split: args.split,
    realized_return: args.resolution.realized_return,
    cleared: args.resolution.cleared,
    shortfall: args.resolution.shortfall,
    terminal_status: args.resolution.terminal_status,
  }
}
