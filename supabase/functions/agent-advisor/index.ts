import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createAdminClient } from '../_shared/supabase-admin.ts'
import { callOpenRouter } from '../_shared/openrouter.ts'

const ADVISOR_SYSTEM_PROMPT = `You are Turnkey's AI real estate advisor. You help Ted evaluate deals, understand markets, and make investment decisions.

You have access to Ted's full portfolio: his pipeline, analyses, predictions, and contacts. Answer questions naturally and helpfully. Reference specific data when available.

Always respond in plain text (not JSON). Be concise but thorough. If you're unsure about something, say so.`

serve(async (req) => {
  const supabase = createAdminClient()
  const startedAt = new Date().toISOString()
  const { data: run } = await supabase.from('agent_runs').insert({
    agent_type: 'advisor', trigger: 'manual', started_at: startedAt, status: 'running',
  }).select().single()

  try {
    const { message, context } = await req.json()

    // Build context from database
    let dbContext = ''

    if (context?.property_id) {
      const { data: property } = await supabase.from('properties')
        .select('*, property_analyses(*), property_predictions(*)').eq('id', context.property_id).single()
      dbContext += `\nCurrent property: ${JSON.stringify(property, null, 2)}`
    }

    // Always include pipeline summary
    const { data: pipeline } = await supabase.from('pipeline')
      .select('*, properties(address, city, state, list_price)').limit(20)
    dbContext += `\nPipeline: ${JSON.stringify(pipeline, null, 2)}`

    // Recent agent runs for transparency
    const { data: recentRuns } = await supabase.from('agent_runs')
      .select('agent_type, status, output_summary, completed_at')
      .order('completed_at', { ascending: false }).limit(5)
    dbContext += `\nRecent agent activity: ${JSON.stringify(recentRuns, null, 2)}`

    const { content, tokens, model } = await callOpenRouter(
      ADVISOR_SYSTEM_PROMPT,
      `${dbContext}\n\nTed's question: ${message}`,
      { max_tokens: 2048, json: false }
    )

    // Advisor returns text, not JSON
    const responseText = typeof content === 'string' ? content : JSON.stringify(content)

    await supabase.from('agent_runs').update({
      status: 'success', completed_at: new Date().toISOString(),
      output_summary: responseText.slice(0, 200),
      tokens_used: tokens, model, cost_est: tokens * 0.000003,
      input_summary: message.slice(0, 200),
    }).eq('id', run.id)

    return new Response(JSON.stringify({ response: responseText }), {
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
