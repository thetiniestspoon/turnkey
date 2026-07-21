import fs from 'node:fs'
import path from 'node:path'
import { trackerOutputSchema, type TrackerOutput } from '@/schemas/tracker-output'
import { callClaude, extractJson } from './claude'
import { startRun, finishRun } from './run-log'
import { resolvedPredictions, updatePredictionAccuracy, type Db } from './db'

const SYSTEM = fs.readFileSync(path.join(import.meta.dirname, '..', 'prompts', 'tracker.md'), 'utf8')

export function buildTrackerPrompt(args: { property: Record<string, unknown>; predictions: unknown; propertyId: string }): string {
  return [
    SYSTEM, '',
    `Compare predicted vs actual for this property and score accuracy.`,
    `Property: ${JSON.stringify(args.property)}`,
    `Predictions (with actual_value set): ${JSON.stringify(args.predictions)}`,
    `property_id (echo exactly): ${args.propertyId}`,
    '',
    `Respond with ONLY JSON: {"property_id":"${args.propertyId}","comparisons":[{"metric":str,"predicted":num,"actual":num,"accuracy_pct":num,"assessment":str}],"overall_accuracy":num(0-100),"summary":str,"recommendations":[str]}`,
  ].join('\n')
}

export function parseTrackerOutput(raw: string): TrackerOutput {
  const parsed = extractJson(raw)
  if (!parsed) throw new Error('tracker: no JSON object in output')
  return trackerOutputSchema.parse(parsed)
}

export async function runTracker(deps: {
  db: Db; property: { id: string; address: string }
}): Promise<{ tracked: number }> {
  const { db, property } = deps
  const runId = await startRun(db, 'tracker', 'auto', `Property: ${property.address}`)
  try {
    const preds = await resolvedPredictions(db, property.id)
    if (preds.length === 0) {
      await finishRun(db, runId, { status: 'success', output_summary: 'No resolved predictions to track' })
      return { tracked: 0 }
    }
    const prompt = buildTrackerPrompt({ property, predictions: preds, propertyId: property.id })
    const res = callClaude({ prompt, timeoutMs: 120000 })
    if (res.rateLimited) throw Object.assign(new Error('rate-limited'), { rateLimited: true })
    if (!res.ok) throw new Error(res.error ?? 'tracker: claude call failed')
    const out = parseTrackerOutput(res.text)
    for (const c of out.comparisons) await updatePredictionAccuracy(db, property.id, c.metric, c.accuracy_pct)
    await finishRun(db, runId, { status: 'success', output_summary: `Tracked ${out.comparisons.length} predictions, ${out.overall_accuracy}% accuracy` })
    return { tracked: out.comparisons.length }
  } catch (e) {
    const rl = (e as { rateLimited?: boolean }).rateLimited === true
    await finishRun(db, runId, { status: rl ? 'timeout' : 'error', output_summary: String((e as Error).message ?? e).slice(0, 200) })
    throw e
  }
}
