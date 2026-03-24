import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createAdminClient } from '../_shared/supabase-admin.ts'
import { callOpenRouter } from '../_shared/openrouter.ts'

const ANALYST_SYSTEM_PROMPT = `You are a real estate investment analyst. Given a property and comprehensive market data (demographics, rates, rents, flood risk, walkability, unemployment), produce a detailed financial analysis with two scenarios: Flip and Rental.

You will receive enriched data including:
- Census ACS: income, population, vacancy rate, median home value, median rent, owner-occupancy %
- FRED: mortgage rates, treasury yields, national unemployment
- HUD FMR: fair market rents by bedroom count
- BLS: local unemployment rate
- FEMA NFHL: flood zone classification and risk level
- Walk Score: walkability, transit, and bike scores

Factor ALL available data into your analysis:
- Flood zone HIGH risk → increase insurance cost estimates, lower confidence, flag in explanation
- Low walkability → discount rental estimates for urban markets
- High local unemployment → increase vacancy risk, lower rental confidence
- High vacancy rate → compress rental estimates
- Owner-occupancy % signals investor vs. owner-occupied market dynamics

Return JSON matching this exact structure:
{
  "property_id": "uuid",
  "flip": {
    "arv": number, "renovation_est": number, "carrying_costs": number,
    "total_investment": number, "profit_margin": number, "roi": number,
    "timeline": "string", "confidence": 0-100, "explanation": "string"
  },
  "rental": {
    "monthly_rent": number, "monthly_expenses": number, "monthly_cash_flow": number,
    "annual_noi": number, "cap_rate": number, "cash_on_cash": number,
    "confidence": 0-100, "explanation": "string"
  },
  "risk_factors": {
    "flood_risk": "HIGH|MODERATE|LOW|UNKNOWN",
    "flood_zone": "string or null",
    "flood_insurance_est_annual": number or null,
    "walkability": number or null,
    "local_unemployment": number or null,
    "vacancy_rate": number or null
  },
  "recommended_strategy": "flip|rental|either",
  "overall_confidence": 0-100,
  "summary": "string",
  "data_sources_used": ["string"],
  "data_gaps": ["string"]
}

Be conservative. Lower confidence when data is limited. Always explain your reasoning. Flag any risk factors prominently.`

serve(async (req) => {
  const supabase = createAdminClient()
  const startedAt = new Date().toISOString()
  const { data: run } = await supabase.from('agent_runs').insert({
    agent_type: 'analyst', trigger: 'manual', started_at: startedAt, status: 'running',
  }).select().single()

  try {
    const { property_id } = await req.json()

    // Fetch property
    const { data: property } = await supabase.from('properties')
      .select('*').eq('id', property_id).single()
    if (!property) throw new Error('Property not found')

    // Fetch market-level data via Enricher
    const marketResp = await fetch(
      `${Deno.env.get('SUPABASE_URL')}/functions/v1/agent-enricher`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
        },
        body: JSON.stringify({
          region: property.zip, region_type: 'zip',
          data_types: ['census_acs', 'fred_rates', 'hud_fmr', 'bls_unemployment'],
        }),
      }
    )
    const marketData = await marketResp.json()

    // Fetch property-level data (flood zone, walkability) if lat/lng available
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let propertyData: any = { results: {} }
    if (property.lat && property.lng) {
      const propResp = await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/agent-enricher`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
          },
          body: JSON.stringify({
            region: property.zip, region_type: 'zip',
            data_types: ['fema_flood', 'walkability'],
            lat: property.lat,
            lng: property.lng,
          }),
        }
      )
      propertyData = await propResp.json()
    }

    const allData = { ...marketData.results, ...propertyData.results }

    const userPrompt = `Analyze this property for investment:

Property: ${JSON.stringify(property, null, 2)}

Market & Neighborhood Data:
${JSON.stringify(allData, null, 2)}

property_id: "${property_id}"

Produce flip and rental scenarios with honest confidence scores. Factor in flood risk, walkability, local unemployment, and vacancy data where available.`

    const { content, tokens, model } = await callOpenRouter(ANALYST_SYSTEM_PROMPT, userPrompt)

    // Save analysis
    await supabase.from('property_analyses').insert({
      property_id,
      flip_arv: content.flip.arv,
      flip_renovation_est: content.flip.renovation_est,
      flip_carrying_costs: content.flip.carrying_costs,
      flip_total_investment: content.flip.total_investment,
      flip_profit_margin: content.flip.profit_margin,
      flip_roi: content.flip.roi,
      flip_timeline: content.flip.timeline,
      rental_monthly_est: content.rental.monthly_rent,
      rental_monthly_expenses: content.rental.monthly_expenses,
      rental_monthly_cash_flow: content.rental.monthly_cash_flow,
      rental_annual_noi: content.rental.annual_noi,
      rental_cap_rate: content.rental.cap_rate,
      rental_cash_on_cash: content.rental.cash_on_cash,
      recommended_strategy: content.recommended_strategy,
      confidence_score: content.overall_confidence,
      analysis_summary: content.summary,
      neighborhood_data: allData,
      agent_model: model,
    })

    // Create predictions for tracking
    const predictions = [
      { metric: 'arv', predicted_value: content.flip.arv },
      { metric: 'rental_income', predicted_value: content.rental.monthly_rent },
      { metric: 'renovation_cost', predicted_value: content.flip.renovation_est },
    ]
    for (const pred of predictions) {
      await supabase.from('property_predictions').insert({
        property_id, ...pred,
      })
    }

    await supabase.from('agent_runs').update({
      status: 'success', completed_at: new Date().toISOString(),
      output_summary: `Analyzed ${property.address}: ${content.recommended_strategy} (${content.overall_confidence}% confidence)`,
      tokens_used: tokens, model, cost_est: tokens * 0.000003,
      input_summary: `Property: ${property.address}, ${property.city} ${property.state}`,
    }).eq('id', run.id)

    return new Response(JSON.stringify(content), {
      headers: { 'Content-Type': 'application/json' },
    })
  } catch (error) {
    await supabase.from('agent_runs').update({
      status: 'error', completed_at: new Date().toISOString(), output_summary: error.message,
    }).eq('id', run?.id)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
})
