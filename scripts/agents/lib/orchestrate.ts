import type { Db } from './db'

export interface CriteriaFields {
  max_price?: number | null
  min_cap_rate?: number | null
  min_flip_roi?: number | null
  min_score?: number | null
  property_types?: string[] | null
  strategies?: string[] | null
}

export interface FilterableProperty {
  list_price?: number | null
  property_type?: string | null
  raw_data?: {
    score?: number | null
    recommended_strategy?: string | null
    estimated_cap_rate?: number | null
    estimated_flip_roi?: number | null
  } | null
}

// Ported verbatim from supabase/functions/agent-autoscout/index.ts (mergeCriteria, lines ~34-39).
export function mergeCriteria(
  global: CriteriaFields | null,
  overrides: CriteriaFields | null,
): CriteriaFields {
  return { ...(global || {}), ...(overrides || {}) }
}

// Ported verbatim from supabase/functions/agent-autoscout/index.ts (passesFilter, lines 41-87).
// Each criterion only rejects a property when BOTH the criterion AND the corresponding
// property field are present — a property missing a raw_data field (e.g. no
// estimated_cap_rate) is never failed by that criterion. Field source differs from the
// edge function's flat ScoutProperty: here score/recommended_strategy/estimated_cap_rate/
// estimated_flip_roi live under `raw_data` (the shape properties are persisted in), while
// list_price/property_type stay top-level — matching the `properties` table row shape.
export function passesFilter(prop: FilterableProperty, criteria: CriteriaFields): boolean {
  const raw = prop.raw_data ?? {}

  if (
    criteria.max_price != null &&
    prop.list_price != null &&
    prop.list_price > criteria.max_price
  ) {
    return false
  }
  if (
    criteria.min_cap_rate != null &&
    raw.estimated_cap_rate != null &&
    raw.estimated_cap_rate < criteria.min_cap_rate
  ) {
    return false
  }
  if (
    criteria.min_flip_roi != null &&
    raw.estimated_flip_roi != null &&
    raw.estimated_flip_roi < criteria.min_flip_roi
  ) {
    return false
  }
  if (
    criteria.min_score != null &&
    raw.score != null &&
    raw.score < criteria.min_score
  ) {
    return false
  }
  if (
    criteria.property_types &&
    criteria.property_types.length > 0 &&
    prop.property_type &&
    !criteria.property_types.includes(prop.property_type)
  ) {
    return false
  }
  if (
    criteria.strategies &&
    criteria.strategies.length > 0 &&
    raw.recommended_strategy &&
    !criteria.strategies.includes(raw.recommended_strategy)
  ) {
    return false
  }
  return true
}

// Mirrors agent-orchestrator's processProperty recommendation gate (lines 71-72).
export function shouldRecommend(marketStatus: string | null | undefined, confidence: number | null | undefined): boolean {
  return marketStatus === 'active' && (confidence ?? 0) >= 50
}

// Mirrors agent-orchestrator's upsert (lines 74-84): onConflict user_id,property_id.
export async function upsertRecommendation(db: Db, userId: string, propertyId: string): Promise<void> {
  const { error } = await db.from('user_recommendations').upsert(
    { user_id: userId, property_id: propertyId, recommended: true, dismissed_at: null },
    { onConflict: 'user_id,property_id' },
  )
  if (error) console.error(`upsertRecommendation failed for ${propertyId}: ${error.message}`)
}

// Mirrors agent-orchestrator's stale flagging (lines 149-179): two UPDATE statements —
// set stale_at for properties whose pipeline row is watching/analyzing and stale
// (entered_stage_at older than 30 days) with stale_at still null; clear stale_at for
// properties whose pipeline advanced past watching/analyzing.
export async function flagStale(db: Db): Promise<void> {
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()

  const { data: staleEntries } = await db
    .from('pipeline')
    .select('property_id')
    .in('stage', ['watching', 'analyzing'])
    .lt('entered_stage_at', thirtyDaysAgo)

  if (staleEntries?.length) {
    const staleIds = (staleEntries as Array<{ property_id: string }>).map((e) => e.property_id)
    const { error } = await db
      .from('properties')
      .update({ stale_at: new Date().toISOString() })
      .in('id', staleIds)
      .is('stale_at', null)
    if (error) console.error(`flagStale (set) failed: ${error.message}`)
  }

  const { data: advancedEntries } = await db
    .from('pipeline')
    .select('property_id')
    .not('stage', 'in', '("watching","analyzing")')

  if (advancedEntries?.length) {
    const advancedIds = (advancedEntries as Array<{ property_id: string }>).map((e) => e.property_id)
    const { error } = await db
      .from('properties')
      .update({ stale_at: null })
      .in('id', advancedIds)
      .not('stale_at', 'is', null)
    if (error) console.error(`flagStale (clear) failed: ${error.message}`)
  }
}
