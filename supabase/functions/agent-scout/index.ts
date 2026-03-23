import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createAdminClient } from '../_shared/supabase-admin.ts'
import { callOpenRouter } from '../_shared/openrouter.ts'

const SCOUT_SYSTEM_PROMPT = `You are a real estate investment scout. Your job is to analyze market data and identify undervalued residential properties worth investigating for flip or rental investment.

You will receive market data (demographics, economic indicators, fair market rents) for a target area. Based on this data, identify properties that show investment potential.

Analyze:
1. Price-to-rent ratios that suggest undervaluation
2. Neighborhood economic trends (income growth, population growth)
3. Properties priced below the area's estimated fair value
4. Markets where renovation could yield significant ARV uplift

Return your analysis as JSON matching this exact structure:
{
  "properties": [
    {
      "address": "string",
      "city": "string",
      "state": "XX",
      "zip": "string",
      "property_type": "single_family|condo|multi_family|townhouse",
      "bedrooms": number (optional),
      "bathrooms": number (optional),
      "sqft": number (optional),
      "year_built": number (optional),
      "list_price": number,
      "score": 0-100,
      "rationale": "string explaining why this is a good deal",
      "recommended_strategy": "flip|rental|either",
      "estimated_flip_roi": number (optional, percent),
      "estimated_cap_rate": number (optional, percent)
    }
  ],
  "market_summary": "string overview of the market",
  "data_sources_used": ["string"]
}

Score properties 0-100 based on investment potential. Be conservative with scores — only score above 80 for genuinely compelling opportunities. Flag data gaps honestly.`

serve(async (req) => {
  const supabase = createAdminClient()
  const startedAt = new Date().toISOString()

  // Log the agent run
  const { data: run } = await supabase.from('agent_runs').insert({
    agent_type: 'scout', trigger: 'manual', started_at: startedAt, status: 'running',
  }).select().single()

  try {
    const { market, filters } = await req.json()

    // Call Enricher to get market data
    const enricherResp = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/agent-enricher`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          region: market,
          region_type: 'zip',
          data_types: ['census_acs', 'fred_rates', 'hud_fmr'],
        }),
      }
    )
    const marketData = await enricherResp.json()

    const userPrompt = `Analyze this market for real estate investment opportunities:

Market: ${market}
Filters: ${JSON.stringify(filters || {})}

Available market data:
${JSON.stringify(marketData.results, null, 2)}

Find the most compelling investment properties in this area. For the MVP, use your knowledge of typical property values and market conditions in this area combined with the data provided. Be specific with addresses where possible, or describe property profiles that match the opportunity.`

    const { content, tokens, model } = await callOpenRouter(SCOUT_SYSTEM_PROMPT, userPrompt)

    // Save discovered properties
    for (const prop of content.properties || []) {
      await supabase.from('properties').upsert({
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
        source: 'agent_scout',
        raw_data: { score: prop.score, rationale: prop.rationale, recommended_strategy: prop.recommended_strategy },
      }, { onConflict: 'address,city,state' })
    }

    // Update agent run
    await supabase.from('agent_runs').update({
      status: 'success',
      completed_at: new Date().toISOString(),
      output_summary: `Found ${content.properties?.length || 0} properties in ${market}`,
      tokens_used: tokens,
      model,
      cost_est: tokens * 0.000003, // approximate
      input_summary: `Market: ${market}`,
    }).eq('id', run.id)

    return new Response(JSON.stringify(content), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    await supabase.from('agent_runs').update({
      status: 'error',
      completed_at: new Date().toISOString(),
      output_summary: error.message,
    }).eq('id', run?.id)

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
})
