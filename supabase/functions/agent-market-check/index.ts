import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createAdminClient } from '../_shared/supabase-admin.ts'
import { corsHeaders } from '../_shared/cors.ts'

const GATEWAY_URL = Deno.env.get('LLM_GATEWAY_URL')?.replace('/chat/completions', '/messages')
  || 'https://ai-gateway.vercel.sh/v1/messages'
const GATEWAY_KEY = Deno.env.get('LLM_GATEWAY_API_KEY') || ''

const MARKET_CHECK_SYSTEM_PROMPT = `You are a real estate listing status checker. Your ONLY job is to determine if a specific property is currently listed for sale.

Search for the property and determine its current status. Return JSON (no markdown fences):
{
  "status": "active|off_market|pending|sold|unknown",
  "price_current": number or null,
  "notes": "Brief explanation of what you found"
}

Rules:
- "active" = currently listed for sale
- "pending" = under contract / sale pending
- "sold" = recently sold / closed
- "off_market" = was listed but no longer available
- "unknown" = could not determine status`

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createAdminClient()
  const startedAt = new Date().toISOString()

  const { data: run } = await supabase.from('agent_runs').insert({
    agent_type: 'market_check',
    trigger: 'auto',
    started_at: startedAt,
    status: 'running',
  }).select().single()

  try {
    const { property_id } = await req.json()

    // Fetch property from DB
    const { data: property, error: propError } = await supabase
      .from('properties')
      .select('address, city, state, zip, raw_data, market_status')
      .eq('id', property_id)
      .single()

    if (propError || !property) {
      throw new Error(`Property not found: ${property_id}`)
    }

    const listing_url = property.raw_data?.listing_url
    const previousStatus = property.market_status

    // Build user message
    const userMessage = listing_url
      ? `Check if this property is still for sale: ${property.address}, ${property.city}, ${property.state} ${property.zip}. Listing URL: ${listing_url}`
      : `Check if this property is still for sale: "${property.address}" ${property.city}, ${property.state} ${property.zip}`

    // Call Anthropic Messages API with web_search tool via AI Gateway
    const response = await fetch(GATEWAY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${GATEWAY_KEY}`,
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4.6',
        max_tokens: 1024,
        system: MARKET_CHECK_SYSTEM_PROMPT,
        tools: [
          {
            type: 'web_search_20250305',
            name: 'web_search',
            max_uses: 2,
          },
        ],
        messages: [
          {
            role: 'user',
            content: userMessage,
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

    // Parse the JSON result
    const result = JSON.parse(textContent)
    const { status, price_current, notes } = result

    // Update properties table
    await supabase
      .from('properties')
      .update({
        market_status: status,
        market_status_checked_at: new Date().toISOString(),
      })
      .eq('id', property_id)

    // Insert into property_status_history
    await supabase.from('property_status_history').insert({
      property_id,
      status,
      source: 'agent_market_check',
    })

    // If status changed from active to off_market or sold, dismiss recommendations
    const statusChanged = previousStatus !== status
    const wentInactive = previousStatus === 'active' && (status === 'off_market' || status === 'sold')

    if (wentInactive) {
      await supabase
        .from('user_recommendations')
        .update({
          recommended: false,
          dismissed_at: new Date().toISOString(),
        })
        .eq('property_id', property_id)
    }

    // Calculate tokens and cost
    const usage = data.usage
    const totalTokens = (usage?.input_tokens || 0) + (usage?.output_tokens || 0)

    await supabase.from('agent_runs').update({
      status: 'success',
      completed_at: new Date().toISOString(),
      output_summary: `Property ${property.address}: ${status}${notes ? ` — ${notes}` : ''}`,
      tokens_used: totalTokens,
      model: data.model,
      cost_est: totalTokens * 0.000003,
      input_summary: `Property ID: ${property_id}`,
    }).eq('id', run.id)

    return new Response(
      JSON.stringify({ status, price_current, notes, changed: statusChanged }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    await supabase.from('agent_runs').update({
      status: 'error',
      completed_at: new Date().toISOString(),
      output_summary: error.message,
    }).eq('id', run?.id)

    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  }
})
