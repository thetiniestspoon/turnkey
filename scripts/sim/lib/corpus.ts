import fs from 'node:fs'
import path from 'node:path'
import {
  corpusManifestSchema, observationSchema, outcomeSchema,
  type CorpusManifest, type Observation, type Outcome,
} from '@/schemas/simulation'
import { investmentPolicySchema, type InvestmentPolicy } from './policy'
import { hashObject } from './ledger'

// Loading a corpus. No network, no credentials, no clock — a corpus is four JSON
// files on disk and this turns them into validated, deterministically ordered data.

export type Corpus = {
  manifest: CorpusManifest
  observations: Observation[]
  outcomes: Map<string, Outcome>
  policy: InvestmentPolicy
  corpusHash: string
}

export type RawCorpus = {
  manifest: unknown
  properties: unknown[]
  analyses: unknown[]
  outcomes: unknown[]
  policy: unknown
}

export function parseCorpus(raw: RawCorpus): Corpus {
  const manifest = corpusManifestSchema.parse(raw.manifest)
  const policy = investmentPolicySchema.parse(raw.policy)

  // Index analyses and outcomes before joining so a missing one is a named error
  // rather than an undefined that surfaces three layers later as NaN.
  const analysesById = new Map<string, unknown>()
  for (const a of raw.analyses) {
    const id = (a as { property_id?: string })?.property_id
    if (typeof id === 'string') analysesById.set(id, a)
  }
  const outcomesById = new Map<string, Outcome>()
  for (const o of raw.outcomes) {
    const parsed = outcomeSchema.parse(o)
    outcomesById.set(parsed.property_id, parsed)
  }

  const observations: Observation[] = []
  for (const p of raw.properties) {
    const id = (p as { id?: string })?.id
    if (typeof id !== 'string') throw new Error('corpus: a property row has no id')
    const analysis = analysesById.get(id)
    if (!analysis) throw new Error(`corpus: property ${id} has no analysis`)
    if (!outcomesById.has(id)) throw new Error(`corpus: property ${id} has no outcome`)
    observations.push(observationSchema.parse({ property: p, analysis }))
  }

  // Sort by property id. Iteration order of the corpus must not depend on the order
  // rows happen to sit in a file, or two byte-different-but-equivalent corpora would
  // produce different run ids and different fit/holdout behaviour.
  observations.sort((a, b) => (a.property.id < b.property.id ? -1 : a.property.id > b.property.id ? 1 : 0))

  const corpusHash = hashObject({
    manifest,
    observations,
    outcomes: [...outcomesById.values()].sort((a, b) =>
      a.property_id < b.property_id ? -1 : a.property_id > b.property_id ? 1 : 0),
    policy,
  })

  return { manifest, observations, outcomes: outcomesById, policy, corpusHash }
}

function readJson(dir: string, file: string): unknown {
  const p = path.join(dir, file)
  if (!fs.existsSync(p)) throw new Error(`corpus: missing ${file} in ${dir}`)
  return JSON.parse(fs.readFileSync(p, 'utf8'))
}

export function loadCorpus(dir: string): Corpus {
  return parseCorpus({
    manifest: readJson(dir, 'manifest.json'),
    properties: readJson(dir, 'properties.json') as unknown[],
    analyses: readJson(dir, 'analyses.json') as unknown[],
    outcomes: readJson(dir, 'outcomes.json') as unknown[],
    policy: readJson(dir, 'policy.json'),
  })
}
