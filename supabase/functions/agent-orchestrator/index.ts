import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createAdminClient } from '../_shared/supabase-admin.ts'
import { corsHeaders } from '../_shared/cors.ts'

async function processProperty(
  propertyId: string,
  userId: string,
  minScore: number,
  supabase: ReturnType<typeof createAdminClient>,
  supabaseUrl: string,
  serviceRoleKey: string,
) {
  // 1. Fetch property, get score from raw_data
  const { data: property } = await supabase
    .from('properties')
    .select('id, raw_data')
    .eq('id', propertyId)
    .single()

  if (!property) return { propertyId, skipped: true, reason: 'not found' }

  const score = property.raw_data?.score ?? 0
  if (score < minScore) {
    return { propertyId, skipped: true, reason: `score ${score} < ${minScore}` }
  }

  // 2. Check if analysis already exists
  const { data: existingAnalysis } = await supabase
    .from('property_analyses')
    .select('id')
    .eq('property_id', propertyId)
    .limit(1)

  // 3. If no analysis, call agent-analyst
  if (!existingAnalysis || existingAnalysis.length === 0) {
    const analystResp = await fetch(`${supabaseUrl}/functions/v1/agent-analyst`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${serviceRoleKey}`,
      },
      body: JSON.stringify({ property_id: propertyId }),
    })
    if (!analystResp.ok) {
      const errText = await analystResp.text()
      throw new Error(`Analyst failed for ${propertyId}: ${errText}`)
    }
  }

  // 4. Call agent-market-check
  const marketResp = await fetch(`${supabaseUrl}/functions/v1/agent-market-check`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceRoleKey}`,
    },
    body: JSON.stringify({ property_id: propertyId }),
  })
  const marketResult = marketResp.ok ? await marketResp.json() : { status: 'unknown' }

  // 5. Check if property should be recommended
  // Re-fetch analysis (might have just been created by agent-analyst)
  const { data: analysis } = await supabase
    .from('property_analyses')
    .select('confidence_score')
    .eq('property_id', propertyId)
    .order('analyzed_at', { ascending: false })
    .limit(1)
    .single()

  const shouldRecommend =
    marketResult.status === 'active' && (analysis?.confidence_score ?? 0) >= 50

  if (shouldRecommend) {
    await supabase.from('user_recommendations').upsert(
      {
        user_id: userId,
        property_id: propertyId,
        recommended: true,
        dismissed_at: null,
      },
      { onConflict: 'user_id,property_id' },
    )
  }

  return {
    propertyId,
    analyzed: true,
    marketStatus: marketResult.status,
    recommended: shouldRecommend,
  }
}

serve(async (req) => {
  // 1. CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createAdminClient()
  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
  const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

  // 2. Log orchestrator run (insert early so we have run.id for error handling)
  const { data: run } = await supabase
    .from('agent_runs')
    .insert({
      agent_type: 'orchestrator',
      trigger: 'auto',
      started_at: new Date().toISOString(),
      status: 'running',
    })
    .select()
    .single()

  try {
    const { property_ids, user_id } = await req.json()

    if (!property_ids?.length || !user_id) {
      throw new Error('property_ids (non-empty array) and user_id are required')
    }

    // Update the run with user_id context
    await supabase
      .from('agent_runs')
      .update({ input_summary: `user=${user_id}, properties=${property_ids.length}` })
      .eq('id', run.id)

    // 3. Fetch user's auto_analyze_min_score (default 60)
    const { data: criteria } = await supabase
      .from('investment_criteria')
      .select('auto_analyze_min_score')
      .eq('user_id', user_id)
      .single()
    const minScore = criteria?.auto_analyze_min_score ?? 60

    // 4. Process properties in batches of 3
    const results: PromiseSettledResult<unknown>[] = []
    for (let i = 0; i < property_ids.length; i += 3) {
      const batch = property_ids.slice(i, i + 3)
      const batchResults = await Promise.allSettled(
        batch.map((id: string) =>
          processProperty(id, user_id, minScore, supabase, SUPABASE_URL, SERVICE_ROLE_KEY),
        ),
      )
      results.push(...batchResults)
    }

    // 5. Stale flagging — flag properties in watching/analyzing for 30+ days
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()
    const { data: staleEntries } = await supabase
      .from('pipeline')
      .select('property_id')
      .in('stage', ['watching', 'analyzing'])
      .lt('entered_stage_at', thirtyDaysAgo)

    if (staleEntries?.length) {
      const staleIds = staleEntries.map((e: { property_id: string }) => e.property_id)
      await supabase
        .from('properties')
        .update({ stale_at: new Date().toISOString() })
        .in('id', staleIds)
        .is('stale_at', null)
    }

    // Clear stale for properties that advanced past watching/analyzing
    const { data: advancedEntries } = await supabase
      .from('pipeline')
      .select('property_id')
      .not('stage', 'in', '("watching","analyzing")')

    if (advancedEntries?.length) {
      const advancedIds = advancedEntries.map((e: { property_id: string }) => e.property_id)
      await supabase
        .from('properties')
        .update({ stale_at: null })
        .in('id', advancedIds)
        .not('stale_at', 'is', null)
    }

    // 6. Log success
    const succeeded = results.filter((r) => r.status === 'fulfilled').length
    const failed = results.filter((r) => r.status === 'rejected').length

    await supabase
      .from('agent_runs')
      .update({
        status: 'success',
        completed_at: new Date().toISOString(),
        output_summary: `Processed ${property_ids.length} properties: ${succeeded} ok, ${failed} failed`,
      })
      .eq('id', run.id)

    return new Response(
      JSON.stringify({ processed: property_ids.length, succeeded, failed }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    await supabase
      .from('agent_runs')
      .update({
        status: 'error',
        completed_at: new Date().toISOString(),
        output_summary: error.message,
      })
      .eq('id', run?.id)

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
