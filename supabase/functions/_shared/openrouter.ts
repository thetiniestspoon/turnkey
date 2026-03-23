const GATEWAY_URL = Deno.env.get('LLM_GATEWAY_URL') || 'https://ai-gateway.vercel.sh/v1/chat/completions'
const GATEWAY_KEY = Deno.env.get('LLM_GATEWAY_API_KEY') || ''

export async function callOpenRouter(
  systemPrompt: string,
  userPrompt: string,
  options: { model?: string; temperature?: number; max_tokens?: number; json?: boolean } = {}
) {
  const {
    model = 'anthropic/claude-sonnet-4.6',
    temperature = 0.3,
    max_tokens = 4096,
  } = options

  const body: any = {
    model,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
    temperature,
    max_tokens,
  }

  // Note: Vercel AI Gateway with Anthropic doesn't support response_format.
  // JSON output is enforced via system prompts instead.

  const response = await fetch(GATEWAY_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${GATEWAY_KEY}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`LLM Gateway error (${response.status}): ${error}`)
  }

  const data = await response.json()
  let content = data.choices[0].message.content
  const usage = data.usage

  // Strip markdown code fences if the model wraps JSON in ```json ... ```
  if (options.json !== false && typeof content === 'string') {
    content = content.replace(/^```(?:json)?\s*\n?/i, '').replace(/\n?```\s*$/i, '').trim()
  }

  return {
    content: options.json !== false ? JSON.parse(content) : content,
    tokens: usage?.total_tokens ?? 0,
    model: data.model,
  }
}
