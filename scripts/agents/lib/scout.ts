import fs from 'node:fs'
import path from 'node:path'
import { scoutOutputSchema } from '@/schemas/scout-output'
import { callClaude, extractJson } from './claude'
import { enrichMarket } from './enrich'
import { upsertProperty, type Db, type PropertyRow } from './db'
import { startRun, finishRun } from './run-log'

const SYSTEM = fs.readFileSync(path.join(import.meta.dirname, '..', 'prompts', 'scout.md'), 'utf8')

export type RawScoutProperty = {
  address: string; city: string; state: string; zip: string; property_type: string
  bedrooms?: number; bathrooms?: number; sqft?: number; year_built?: number
  list_price: number; score: number; rationale: string; recommended_strategy: string
  estimated_flip_roi?: number; estimated_cap_rate?: number
  listing_url?: string | null; image_url?: string | null
}

export function buildScoutPrompt(args: {
  market: string
  marketData: Record<string, unknown>
  filters: Record<string, unknown>
}): string {
  return [
    SYSTEM,
    '',
    `Find investment-grade real-estate listings currently for sale in ZIP ${args.market}.`,
    `Use web search over major listing sites (zillow, redfin, realtor, homes, trulia, movoto, opendoor). Only include REAL, currently-listed properties with a listing_url. Never fabricate.`,
    '',
    `Market context (from public data sources): ${JSON.stringify(args.marketData)}`,
    `Buyer filters: ${JSON.stringify(args.filters)}`,
    '',
    `Respond with ONLY a JSON object (no prose, no code fence) of this exact shape:`,
    `{"properties":[{"address":str,"city":str,"state":str(2),"zip":str,"property_type":"single_family|condo|multi_family|townhouse","bedrooms":int?,"bathrooms":num?,"sqft":int?,"year_built":int?,"list_price":num,"score":int(0-100),"rationale":str,"recommended_strategy":"flip|rental|either","estimated_flip_roi":num?,"estimated_cap_rate":num?,"listing_url":str,"image_url":str|null}],"market_summary":str,"data_sources_used":[str]}`,
  ].join('\n')
}

export function parseScoutOutput(raw: string): { properties: RawScoutProperty[]; market_summary: string; data_sources_used: string[] } {
  const parsed = extractJson(raw)
  if (!parsed) throw new Error('scout: no JSON object in output')
  scoutOutputSchema.parse(parsed) // validates core fields; throws on violation
  const p = parsed as { properties: RawScoutProperty[]; market_summary: string; data_sources_used: string[] }
  return p
}

export function mapScoutPropertyToRow(p: RawScoutProperty, source: 'autoscout' | 'agent_scout'): PropertyRow {
  return {
    address: p.address, city: p.city, state: p.state, zip: p.zip,
    property_type: p.property_type,
    bedrooms: p.bedrooms ?? null, bathrooms: p.bathrooms ?? null,
    sqft: p.sqft ?? null, year_built: p.year_built ?? null,
    list_price: p.list_price, estimated_value: p.list_price,
    source,
    raw_data: {
      score: p.score, rationale: p.rationale, recommended_strategy: p.recommended_strategy,
      estimated_flip_roi: p.estimated_flip_roi ?? null, estimated_cap_rate: p.estimated_cap_rate ?? null,
      listing_url: p.listing_url ?? null, image_url: p.image_url ?? null,
      scouted_at: new Date().toISOString(),
    },
  }
}

export async function runScout(deps: {
  db: Db; url: string; key: string; market: string
  filters?: Record<string, unknown>; dryRun: boolean
}): Promise<{ found: number; saved: number }> {
  const { db, url, key, market, dryRun } = deps
  const filters = deps.filters ?? {}
  if (dryRun) {
    console.log(`  [dry-run] scout ${market}: would enrich + call claude -p (web) + upsert properties`)
    return { found: 0, saved: 0 }
  }
  const runId = await startRun(db, 'scout', 'manual', `Market: ${market}`)
  try {
    const enrich = await enrichMarket({ url, key, region: market, data_types: ['census_acs', 'fred_rates', 'hud_fmr', 'bls_unemployment'] })
    const prompt = buildScoutPrompt({ market, marketData: enrich.results ?? {}, filters })
    const res = callClaude({ prompt, allowedTools: ['WebSearch', 'WebFetch'], timeoutMs: 240000 })
    if (res.rateLimited) throw Object.assign(new Error('rate-limited'), { rateLimited: true })
    if (!res.ok) throw new Error(res.error ?? 'scout: claude call failed')
    const out = parseScoutOutput(res.text)
    let saved = 0
    for (const p of out.properties) {
      const row = mapScoutPropertyToRow(p, 'autoscout')
      const r = await upsertProperty(db, row)
      if (r) saved++
    }
    await finishRun(db, runId, { status: 'success', output_summary: `Found ${out.properties.length} real listings in ${market}` })
    return { found: out.properties.length, saved }
  } catch (e) {
    const rl = (e as { rateLimited?: boolean }).rateLimited === true
    await finishRun(db, runId, { status: rl ? 'timeout' : 'error', output_summary: String((e as Error).message ?? e).slice(0, 200) })
    throw e
  }
}
