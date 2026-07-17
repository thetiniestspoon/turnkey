import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { assertServiceRoleKey } from './env'

export type Db = SupabaseClient

export function createAdminClient(env: NodeJS.ProcessEnv = process.env): Db {
  const { url, key } = assertServiceRoleKey(env)
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export type PropertyRow = {
  address: string; city: string; state: string; zip: string
  property_type: string
  bedrooms?: number | null; bathrooms?: number | null; sqft?: number | null; year_built?: number | null
  list_price: number; estimated_value: number
  source: 'autoscout' | 'agent_scout'
  raw_data: Record<string, unknown>
}

export async function upsertProperty(db: Db, row: PropertyRow): Promise<{ id: string } | null> {
  const { data, error } = await db
    .from('properties')
    .upsert(row, { onConflict: 'address,city,state' })
    .select('id')
    .single()
  if (error) {
    console.error(`  upsertProperty failed for ${row.address}: ${error.message}`)
    return null
  }
  return data as { id: string }
}

export async function insertAgentRun(
  db: Db,
  row: { agent_type: string; trigger: 'cron' | 'manual' | 'auto'; input_summary?: string },
): Promise<string> {
  const { data, error } = await db
    .from('agent_runs')
    .insert({ ...row, status: 'running' })
    .select('id')
    .single()
  if (error) throw new Error(`insertAgentRun failed: ${error.message}`)
  return (data as { id: string }).id
}

export async function updateAgentRun(
  db: Db,
  id: string,
  patch: Record<string, unknown>,
): Promise<void> {
  const { error } = await db.from('agent_runs').update(patch).eq('id', id)
  if (error) console.error(`updateAgentRun ${id} failed: ${error.message}`)
}

export type AnalysisRow = {
  property_id: string
  flip_arv: number; flip_renovation_est: number; flip_carrying_costs: number
  flip_total_investment: number; flip_profit_margin: number; flip_roi: number; flip_timeline: string
  rental_monthly_est: number; rental_monthly_expenses: number; rental_monthly_cash_flow: number
  rental_annual_noi: number; rental_cap_rate: number; rental_cash_on_cash: number
  recommended_strategy: string; confidence_score: number; analysis_summary: string
  neighborhood_data: Record<string, unknown>; agent_model: string
}
export type PredictionRow = { property_id: string; metric: string; predicted_value: number }

export async function insertAnalysis(db: Db, row: AnalysisRow): Promise<void> {
  const { error } = await db.from('property_analyses').insert(row)
  if (error) throw new Error(`insertAnalysis failed: ${error.message}`)
}
export async function insertPredictions(db: Db, rows: PredictionRow[]): Promise<void> {
  const { error } = await db.from('property_predictions').insert(rows)
  if (error) throw new Error(`insertPredictions failed: ${error.message}`)
}
export async function latestAnalysisConfidence(db: Db, propertyId: string): Promise<number | null> {
  const { data } = await db.from('property_analyses').select('confidence_score')
    .eq('property_id', propertyId).order('analyzed_at', { ascending: false }).limit(1).maybeSingle()
  return (data as { confidence_score: number } | null)?.confidence_score ?? null
}
export async function hasAnalysis(db: Db, propertyId: string): Promise<boolean> {
  const { data } = await db.from('property_analyses').select('id').eq('property_id', propertyId).limit(1).maybeSingle()
  return !!data
}

export async function updatePropertyMarketStatus(db: Db, propertyId: string, status: string): Promise<void> {
  const { error } = await db.from('properties')
    .update({ market_status: status, market_status_checked_at: new Date().toISOString() }).eq('id', propertyId)
  if (error) throw new Error(`updatePropertyMarketStatus failed: ${error.message}`)
}
export async function insertStatusHistory(db: Db, propertyId: string, status: string): Promise<void> {
  const { error } = await db.from('property_status_history')
    .insert({ property_id: propertyId, status, source: 'agent_market_check' })
  if (error) console.error(`insertStatusHistory failed: ${error.message}`)
}
export async function dismissRecommendations(db: Db, propertyId: string): Promise<void> {
  const { error } = await db.from('user_recommendations')
    .update({ recommended: false, dismissed_at: new Date().toISOString() }).eq('property_id', propertyId)
  if (error) console.error(`dismissRecommendations failed: ${error.message}`)
}
