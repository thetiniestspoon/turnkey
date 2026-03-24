import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createAdminClient } from '../_shared/supabase-admin.ts'
import { corsHeaders } from '../_shared/cors.ts'

interface CriteriaFields {
  max_price?: number | null
  min_cap_rate?: number | null
  min_flip_roi?: number | null
  min_score?: number | null
  property_types?: string[] | null
  strategies?: string[] | null
}

interface ScoutProperty {
  address: string
  city: string
  state: string
  zip: string
  property_type?: string
  bedrooms?: number
  bathrooms?: number
  sqft?: number
  year_built?: number
  list_price?: number
  score?: number
  rationale?: string
  recommended_strategy?: string
  estimated_flip_roi?: number
  estimated_cap_rate?: number
  listing_url?: string
  image_url?: string
}

function mergeCriteria(
  global: CriteriaFields | null,
  overrides: CriteriaFields | null
): CriteriaFields {
  return { ...(global || {}), ...(overrides || {}) }
}

function passesFilter(prop: ScoutProperty, criteria: CriteriaFields): boolean {
  if (
    criteria.max_price != null &&
    prop.list_price != null &&
    prop.list_price > criteria.max_price
  ) {
    return false
  }
  if (
    criteria.min_cap_rate != null &&
    prop.estimated_cap_rate != null &&
    prop.estimated_cap_rate < criteria.min_cap_rate
  ) {
    return false
  }
  if (
    criteria.min_flip_roi != null &&
    prop.estimated_flip_roi != null &&
    prop.estimated_flip_roi < criteria.min_flip_roi
  ) {
    return false
  }
  if (
    criteria.min_score != null &&
    prop.score != null &&
    prop.score < criteria.min_score
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
    prop.recommended_strategy &&
    !criteria.strategies.includes(prop.recommended_strategy)
  ) {
    return false
  }
  return true
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
serve(async (_req) => {
  if (_req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createAdminClient()
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // Fetch active watchlists scheduled for today's day-of-week
  const { data: watchlists, error: wlError } = await supabase
    .from('watchlists')
    .select('*')
    .eq('active', true)
    .eq('scout_day', new Date().getDay())

  if (wlError) {
    return new Response(JSON.stringify({ error: wlError.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const results: { watchlist_id: string; name: string; saved: number; error?: string }[] = []

  // Track saved property IDs per user across all processed watchlists
  const savedByUser = new Map<string, string[]>()

  for (const wl of watchlists || []) {
    const runStartedAt = new Date().toISOString()
    const { data: run } = await supabase
      .from('agent_runs')
      .insert({
        agent_type: 'autoscout',
        trigger: 'cron',
        started_at: runStartedAt,
        status: 'running',
        input_summary: `Watchlist: ${wl.name} (${wl.zip})`,
      })
      .select()
      .single()

    try {
      // Fetch user's global investment criteria
      const { data: globalCriteria } = await supabase
        .from('investment_criteria')
        .select('*')
        .eq('user_id', wl.user_id)
        .single()

      const merged = mergeCriteria(
        globalCriteria
          ? {
              max_price: globalCriteria.max_price,
              min_cap_rate: globalCriteria.min_cap_rate,
              min_flip_roi: globalCriteria.min_flip_roi,
              min_score: globalCriteria.min_score,
              property_types: globalCriteria.property_types,
              strategies: globalCriteria.strategies,
            }
          : null,
        wl.criteria_overrides as CriteriaFields | null
      )

      // Call the existing agent-scout Edge Function
      const scoutResp = await fetch(`${SUPABASE_URL}/functions/v1/agent-scout`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ market: wl.zip }),
      })

      if (!scoutResp.ok) {
        const errText = await scoutResp.text()
        throw new Error(`Scout function error (${scoutResp.status}): ${errText}`)
      }

      const scoutData = await scoutResp.json()
      const properties: ScoutProperty[] = scoutData.properties || []

      // Filter properties against merged criteria
      const passing = properties.filter((p) => passesFilter(p, merged))

      // Save passing properties and collect their IDs
      const savedIds: string[] = []
      for (const prop of passing) {
        const { data: upserted } = await supabase
          .from('properties')
          .upsert(
            {
              address: prop.address,
              city: prop.city,
              state: prop.state,
              zip: prop.zip,
              property_type: prop.property_type,
              bedrooms: prop.bedrooms,
              bathrooms: prop.bathrooms,
              sqft: prop.sqft,
              year_built: prop.year_built,
              list_price: prop.list_price,
              estimated_value: prop.list_price,
              source: 'autoscout',
              raw_data: {
                score: prop.score,
                rationale: prop.rationale,
                recommended_strategy: prop.recommended_strategy,
                estimated_flip_roi: prop.estimated_flip_roi,
                estimated_cap_rate: prop.estimated_cap_rate,
                listing_url: prop.listing_url,
                image_url: prop.image_url,
                scouted_at: new Date().toISOString(),
              },
            },
            { onConflict: 'address,city,state' }
          )
          .select('id')
          .single()
        if (upserted?.id) {
          savedIds.push(upserted.id)
        }
      }

      // Accumulate saved property IDs for this user
      if (savedIds.length > 0) {
        const existing = savedByUser.get(wl.user_id) || []
        savedByUser.set(wl.user_id, [...existing, ...savedIds])
      }

      // Update watchlist last_scouted_at
      await supabase
        .from('watchlists')
        .update({ last_scouted_at: new Date().toISOString() })
        .eq('id', wl.id)

      // Log success
      await supabase
        .from('agent_runs')
        .update({
          status: 'success',
          completed_at: new Date().toISOString(),
          output_summary: `Found ${properties.length} properties, ${passing.length} passed criteria for ${wl.name} (${wl.zip})`,
        })
        .eq('id', run?.id)

      results.push({ watchlist_id: wl.id, name: wl.name, saved: passing.length })
    } catch (error: unknown) {
      // Log error but continue to next watchlist
      const errMsg = error instanceof Error ? error.message : String(error)
      await supabase
        .from('agent_runs')
        .update({
          status: 'error',
          completed_at: new Date().toISOString(),
          output_summary: errMsg,
        })
        .eq('id', run?.id)

      results.push({
        watchlist_id: wl.id,
        name: wl.name,
        saved: 0,
        error: errMsg,
      })
    }
  }

  // Trigger orchestrator for each user that had properties saved
  const orchestratorResults: { user_id: string; property_ids: string[]; ok: boolean }[] = []
  for (const [user_id, property_ids] of savedByUser.entries()) {
    try {
      const orchResp = await fetch(`${SUPABASE_URL}/functions/v1/agent-orchestrator`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ property_ids, user_id }),
      })
      orchestratorResults.push({ user_id, property_ids, ok: orchResp.ok })
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err)
      orchestratorResults.push({ user_id, property_ids, ok: false })
      console.error(`Failed to trigger orchestrator for user ${user_id}: ${errMsg}`)
    }
  }

  return new Response(JSON.stringify({ results, orchestratorResults }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
