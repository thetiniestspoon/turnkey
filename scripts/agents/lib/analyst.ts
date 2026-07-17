import fs from 'node:fs'
import path from 'node:path'
import { analystOutputSchema, type AnalystOutput } from '@/schemas/analyst-output'
import { callClaude, extractJson } from './claude'
import { enrichMarket } from './enrich'
import { startRun, finishRun, SUBSCRIPTION_MODEL } from './run-log'
import { insertAnalysis, insertPredictions, type Db, type AnalysisRow, type PredictionRow } from './db'

const SYSTEM = fs.readFileSync(path.join(import.meta.dirname, '..', 'prompts', 'analyst.md'), 'utf8')

export function buildAnalystPrompt(args: { property: Record<string, unknown>; marketData: Record<string, unknown>; propertyId: string }): string {
  return [
    SYSTEM, '',
    `Analyze this property for both flip and rental strategies.`,
    `Property: ${JSON.stringify(args.property)}`,
    `Enriched market/neighborhood data: ${JSON.stringify(args.marketData)}`,
    `property_id (echo it back exactly): ${args.propertyId}`,
    '',
    `Respond with ONLY a JSON object matching: {"property_id":"${args.propertyId}","flip":{"arv":num,"renovation_est":num,"carrying_costs":num,"total_investment":num,"profit_margin":num,"roi":num,"timeline":str,"confidence":int(0-100),"explanation":str},"rental":{"monthly_rent":num,"monthly_expenses":num,"monthly_cash_flow":num,"annual_noi":num,"cap_rate":num,"cash_on_cash":num,"confidence":int(0-100),"explanation":str},"recommended_strategy":"flip|rental|either","overall_confidence":int(0-100),"summary":str,"data_sources_used":[str],"data_gaps":[str]}`,
  ].join('\n')
}

export function parseAnalystOutput(raw: string): AnalystOutput {
  const parsed = extractJson(raw)
  if (!parsed) throw new Error('analyst: no JSON object in output')
  return analystOutputSchema.parse(parsed)
}

export function mapAnalysisToRow(out: AnalystOutput, propertyId: string, model: string, neighborhood: Record<string, unknown>): AnalysisRow {
  return {
    property_id: propertyId,
    flip_arv: out.flip.arv, flip_renovation_est: out.flip.renovation_est, flip_carrying_costs: out.flip.carrying_costs,
    flip_total_investment: out.flip.total_investment, flip_profit_margin: out.flip.profit_margin, flip_roi: out.flip.roi,
    flip_timeline: out.flip.timeline,
    rental_monthly_est: out.rental.monthly_rent, // GOTCHA: LLM field monthly_rent → column rental_monthly_est
    rental_monthly_expenses: out.rental.monthly_expenses, rental_monthly_cash_flow: out.rental.monthly_cash_flow,
    rental_annual_noi: out.rental.annual_noi, rental_cap_rate: out.rental.cap_rate, rental_cash_on_cash: out.rental.cash_on_cash,
    recommended_strategy: out.recommended_strategy,
    confidence_score: out.overall_confidence, // GOTCHA: overall_confidence → confidence_score
    analysis_summary: out.summary,             // GOTCHA: summary → analysis_summary
    neighborhood_data: neighborhood, agent_model: model,
  }
}

export function mapPredictionRows(out: AnalystOutput, propertyId: string): PredictionRow[] {
  return [
    { property_id: propertyId, metric: 'arv', predicted_value: out.flip.arv },
    { property_id: propertyId, metric: 'rental_income', predicted_value: out.rental.monthly_rent },
    { property_id: propertyId, metric: 'renovation_cost', predicted_value: out.flip.renovation_est },
  ]
}

export async function runAnalyst(deps: {
  db: Db; url: string; key: string; property: Record<string, unknown> & { id: string; address: string; city: string; state: string; zip: string; lat?: number | null; lng?: number | null }
}): Promise<void> {
  const { db, url, key, property } = deps
  const runId = await startRun(db, 'analyst', 'auto', `Property: ${property.address}, ${property.city} ${property.state}`)
  try {
    const base = await enrichMarket({ url, key, region: property.zip, data_types: ['census_acs', 'fred_rates', 'hud_fmr', 'bls_unemployment'] })
    let merged = { ...(base.results ?? {}) }
    if (property.lat != null && property.lng != null) {
      const geo = await enrichMarket({ url, key, region: property.zip, data_types: ['fema_flood', 'walkability'], lat: property.lat, lng: property.lng })
      merged = { ...merged, ...(geo.results ?? {}) }
    }
    const prompt = buildAnalystPrompt({ property, marketData: merged, propertyId: property.id })
    const res = callClaude({ prompt, timeoutMs: 180000 }) // no web tools
    if (res.rateLimited) throw Object.assign(new Error('rate-limited'), { rateLimited: true })
    if (!res.ok) throw new Error(res.error ?? 'analyst: claude call failed')
    const out = parseAnalystOutput(res.text)
    await insertAnalysis(db, mapAnalysisToRow(out, property.id, SUBSCRIPTION_MODEL, merged))
    await insertPredictions(db, mapPredictionRows(out, property.id))
    await finishRun(db, runId, { status: 'success', output_summary: `Analyzed ${property.address}: ${out.recommended_strategy} (${out.overall_confidence}% confidence)` })
  } catch (e) {
    const rl = (e as { rateLimited?: boolean }).rateLimited === true
    await finishRun(db, runId, { status: rl ? 'timeout' : 'error', output_summary: String((e as Error).message ?? e).slice(0, 200) })
    throw e
  }
}
