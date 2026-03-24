import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/cors.ts'

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const results: Record<string, unknown> = {}

  // 1. Check env vars
  const gatewayUrl = Deno.env.get('LLM_GATEWAY_URL') || '(not set)'
  const gatewayKey = Deno.env.get('LLM_GATEWAY_API_KEY') || '(not set)'
  results.gateway_url = gatewayUrl
  results.gateway_key_set = gatewayKey !== '(not set)'
  results.gateway_key_length = gatewayKey.length
  results.gateway_key_prefix = gatewayKey.substring(0, 8) + '...'

  // 2. Test the chat/completions endpoint (used by advisor/analyst/tracker)
  try {
    const chatUrl = gatewayUrl
    const resp = await fetch(chatUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gatewayKey}`,
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4.6',
        messages: [{ role: 'user', content: 'Say "ok" and nothing else.' }],
        max_tokens: 10,
      }),
    })
    const text = await resp.text()
    results.chat_completions = {
      status: resp.status,
      ok: resp.ok,
      body_length: text.length,
      body_preview: text.substring(0, 500),
    }
  } catch (e) {
    results.chat_completions = { error: e.message }
  }

  // 3. Test the messages endpoint (used by scout)
  try {
    const messagesUrl = gatewayUrl.replace('/chat/completions', '/messages')
    results.messages_url = messagesUrl
    const resp = await fetch(messagesUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${gatewayKey}`,
      },
      body: JSON.stringify({
        model: 'anthropic/claude-sonnet-4.6',
        max_tokens: 10,
        messages: [{ role: 'user', content: 'Say "ok" and nothing else.' }],
      }),
    })
    const text = await resp.text()
    results.messages_api = {
      status: resp.status,
      ok: resp.ok,
      body_length: text.length,
      body_preview: text.substring(0, 500),
    }
  } catch (e) {
    results.messages_api = { error: e.message }
  }

  // 4. Check enricher API keys
  results.api_keys = {
    census: (Deno.env.get('CENSUS_API_KEY') || '').length > 0,
    fred: (Deno.env.get('FRED_API_KEY') || '').length > 0,
    hud: (Deno.env.get('HUD_API_TOKEN') || '').length > 0,
    bls: (Deno.env.get('BLS_API_KEY') || '').length > 0,
    walkscore: (Deno.env.get('WALKSCORE_API_KEY') || '').length > 0,
  }

  return new Response(JSON.stringify(results, null, 2), {
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
