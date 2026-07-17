import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { callClaude, extractJson } from './claude'
import { startRun, finishRun } from './run-log'
import { updatePropertyMarketStatus, insertStatusHistory, dismissRecommendations, type Db } from './db'

const SYSTEM = fs.readFileSync(path.join(import.meta.dirname, '..', 'prompts', 'market-check.md'), 'utf8')

export const marketCheckSchema = z.object({
  status: z.enum(['active', 'off_market', 'pending', 'sold', 'unknown']),
  price_current: z.number().nullable(),
  notes: z.string(),
})
export type MarketCheckOutput = z.infer<typeof marketCheckSchema>

export function buildMarketCheckPrompt(args: { address: string; city: string; state: string; zip: string; listing_url?: string | null }): string {
  const lines = [
    SYSTEM, '',
    `Check whether this property is still for sale: ${args.address}, ${args.city}, ${args.state} ${args.zip}`,
  ]
  if (args.listing_url) lines.push(`Listing URL: ${args.listing_url}`)
  lines.push('', `Respond with ONLY JSON: {"status":"active|off_market|pending|sold|unknown","price_current":number|null,"notes":str}`)
  return lines.join('\n')
}

export function parseMarketCheckOutput(raw: string): MarketCheckOutput {
  const parsed = extractJson(raw)
  if (!parsed) throw new Error('market-check: no JSON object in output')
  return marketCheckSchema.parse(parsed)
}

export function wentInactive(prev: string | null, next: string): boolean {
  const wasActive = prev === 'active' || prev == null
  return wasActive && (next === 'off_market' || next === 'sold')
}

export async function runMarketCheck(deps: {
  db: Db; property: { id: string; address: string; city: string; state: string; zip: string; market_status: string | null; raw_data: Record<string, unknown> | null }
}): Promise<{ status: string }> {
  const { db, property } = deps
  const runId = await startRun(db, 'market_check', 'auto', `Property ID: ${property.id}`)
  try {
    const listingUrl = (property.raw_data?.listing_url as string | undefined) ?? null
    const prompt = buildMarketCheckPrompt({ address: property.address, city: property.city, state: property.state, zip: property.zip, listing_url: listingUrl })
    const res = callClaude({ prompt, allowedTools: ['WebSearch', 'WebFetch'], timeoutMs: 120000 })
    if (res.rateLimited) throw Object.assign(new Error('rate-limited'), { rateLimited: true })
    if (!res.ok) throw new Error(res.error ?? 'market-check: claude call failed')
    const out = parseMarketCheckOutput(res.text)
    await updatePropertyMarketStatus(db, property.id, out.status)
    await insertStatusHistory(db, property.id, out.status)
    if (wentInactive(property.market_status, out.status)) await dismissRecommendations(db, property.id)
    await finishRun(db, runId, { status: 'success', output_summary: `Property ${property.address}: ${out.status} — ${out.notes}`.slice(0, 200) })
    return { status: out.status }
  } catch (e) {
    const rl = (e as { rateLimited?: boolean }).rateLimited === true
    await finishRun(db, runId, { status: rl ? 'timeout' : 'error', output_summary: String((e as Error).message ?? e).slice(0, 200) })
    throw e
  }
}
