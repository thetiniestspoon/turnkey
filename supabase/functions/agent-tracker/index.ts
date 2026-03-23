import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createAdminClient } from '../_shared/supabase-admin.ts'
import { callOpenRouter } from '../_shared/openrouter.ts'

const TRACKER_SYSTEM_PROMPT = `You are a real estate prediction tracker. Compare predicted values against actual outcomes and assess accuracy.

Return JSON:
{
  "property_id": "uuid",
  "comparisons": [
    { "metric": "string", "predicted": number, "actual": number, "accuracy_pct": number, "assessment": "string" }
  ],
  "overall_accuracy": 0-100,
  "summary": "string",
  "recommendations": ["string"]
}`

serve(async (req) => {
  const supabase = createAdminClient()
  const startedAt = new Date().toISOString()
  const { data: run } = await supabase.from('agent_runs').insert({
    agent_type: 'tracker', trigger: 'manual', started_at: startedAt, status: 'running',
  }).select().single()

  try {
    const { property_id } = await req.json()

    const { data: predictions } = await supabase.from('property_predictions')
      .select('*').eq('property_id', property_id)
      .not('actual_value', 'is', null)

    if (!predictions || predictions.length === 0) {
      const result = {
        property_id, comparisons: [], overall_accuracy: 0,
        summary: 'No predictions with actual values to compare yet.',
        recommendations: ['Enter actual values for tracked properties to see accuracy.'],
      }
      await supabase.from('agent_runs').update({
        status: 'success', completed_at: new Date().toISOString(),
        output_summary: 'No resolved predictions found', tokens_used: 0,
      }).eq('id', run.id)
      return new Response(JSON.stringify(result), { headers: { 'Content-Type': 'application/json' } })
    }

    const { data: property } = await supabase.from('properties')
      .select('*').eq('id', property_id).single()

    const userPrompt = `Compare predictions vs actuals for this property:

Property: ${JSON.stringify(property, null, 2)}
Predictions: ${JSON.stringify(predictions, null, 2)}

property_id: "${property_id}"`

    const { content, tokens, model } = await callOpenRouter(TRACKER_SYSTEM_PROMPT, userPrompt)

    // Update accuracy scores on predictions
    for (const comparison of content.comparisons) {
      await supabase.from('property_predictions')
        .update({
          accuracy_score: comparison.accuracy_pct,
          resolved_at: new Date().toISOString(),
        })
        .eq('property_id', property_id)
        .eq('metric', comparison.metric)
    }

    await supabase.from('agent_runs').update({
      status: 'success', completed_at: new Date().toISOString(),
      output_summary: `Tracked ${content.comparisons.length} predictions, ${content.overall_accuracy}% accuracy`,
      tokens_used: tokens, model, cost_est: tokens * 0.000003,
    }).eq('id', run.id)

    return new Response(JSON.stringify(content), { headers: { 'Content-Type': 'application/json' } })
  } catch (error) {
    await supabase.from('agent_runs').update({
      status: 'error', completed_at: new Date().toISOString(), output_summary: error.message,
    }).eq('id', run?.id)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    })
  }
})
