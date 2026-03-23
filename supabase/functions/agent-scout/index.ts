import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createAdminClient } from '../_shared/supabase-admin.ts'

const GATEWAY_URL = Deno.env.get('LLM_GATEWAY_URL')?.replace('/chat/completions', '/messages')
  || 'https://ai-gateway.vercel.sh/v1/messages'
const GATEWAY_KEY = Deno.env.get('LLM_GATEWAY_API_KEY') || ''

const SCOUT_SYSTEM_PROMPT = `You are a real estate investment scout. Your job is to search the web for REAL, currently-listed residential properties for sale and evaluate them as investment opportunities.

You have access to a web search tool. USE IT to find actual property listings on Zillow, Redfin, Realtor.com, and other real estate sites.

WORKFLOW:
1. Search for properties currently for sale in the target ZIP/market
2. Find 3-8 real listings with actual addresses and prices
3. Analyze each property's investment potential using the market data provided
4. Return structured results

CRITICAL RULES:
- Every property MUST have a real street address from an actual listing
- Include the listing source URL in the rationale
- If search returns no results for an area, return empty properties array — never fabricate
- Be conservative with scores — only 80+ for genuinely compelling deals`

serve(async (req) => {
  const supabase = createAdminClient()
  const startedAt = new Date().toISOString()

  const { data: run } = await supabase.from('agent_runs').insert({
    agent_type: 'scout', trigger: 'manual', started_at: startedAt, status: 'running',
  }).select().single()

  try {
    const { market, filters } = await req.json()

    // Get market context from Enricher
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

    // Call Anthropic Messages API with web search tool via Vercel AI Gateway
    const response = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GATEWAY_KEY}`,
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4.6',
        max_tokens: 8192,
        system: SCOUT_SYSTEM_PROMPT,
        tools: [
          {
            type: 'web_search_20250305',
            name: 'web_search',
            max_uses: 5,
            allowed_domains: [
              'zillow.com', 'redfin.com', 'realtor.com', 'homes.com',
              'trulia.com', 'movoto.com', 'opendoor.com',
            ],
            user_location: {
              type: 'approximate',
              country: 'US',
            },
          },
        ],
        messages: [
          {
            role: 'user',
            content: `Search for residential properties currently for sale in ZIP code ${market}.

Market context (Census/FRED/HUD):
${JSON.stringify(marketData.results, null, 2)}

Filters: ${JSON.stringify(filters || {})}

Search real estate listing sites for actual properties. Find 3-8 real listings and analyze each as an investment.

After searching, return your analysis as JSON (no markdown fences) matching this structure:
{
  "properties": [
    {
      "address": "123 Real Street",
      "city": "string",
      "state": "XX",
      "zip": "string",
      "property_type": "single_family|condo|multi_family|townhouse",
      "bedrooms": number,
      "bathrooms": number,
      "sqft": number,
      "year_built": number,
      "list_price": number,
      "score": 0-100,
      "rationale": "Why this is a good deal. Include listing URL.",
      "recommended_strategy": "flip|rental|either",
      "estimated_flip_roi": number,
      "estimated_cap_rate": number
    }
  ],
  "market_summary": "Overview of current conditions",
  "data_sources_used": ["sites searched"]
}`,
          },
        ],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`LLM Gateway error (${response.status}): ${errText}`)
    }

    const data = await response.json()

    // Extract text from Anthropic response format (content blocks)
    let textContent = ''
    for (const block of data.content || []) {
      if (block.type === 'text') {
        textContent += block.text
      }
    }

    // Strip markdown fences if present
    textContent = textContent.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()

    // Find the JSON object in the response
    const jsonMatch = textContent.match(/\{[\s\S]*"properties"[\s\S]*\}/)
    if (!jsonMatch) {
      throw new Error('Could not parse JSON from agent response')
    }

    const content = JSON.parse(jsonMatch[0])
    const usage = data.usage

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
        raw_data: {
          score: prop.score,
          rationale: prop.rationale,
          recommended_strategy: prop.recommended_strategy,
          estimated_flip_roi: prop.estimated_flip_roi,
          estimated_cap_rate: prop.estimated_cap_rate,
          scouted_at: new Date().toISOString(),
        },
      }, { onConflict: 'address,city,state' })
    }

    const totalTokens = (usage?.input_tokens || 0) + (usage?.output_tokens || 0)
    await supabase.from('agent_runs').update({
      status: 'success',
      completed_at: new Date().toISOString(),
      output_summary: `Found ${content.properties?.length || 0} real listings in ${market}`,
      tokens_used: totalTokens,
      model: data.model,
      cost_est: totalTokens * 0.000003,
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
