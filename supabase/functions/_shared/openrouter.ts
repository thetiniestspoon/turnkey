export async function callOpenRouter(
  systemPrompt: string,
  userPrompt: string,
  options: { model?: string; temperature?: number; max_tokens?: number; json?: boolean } = {}
) {
  const {
    model = 'anthropic/claude-sonnet-4-20250514',
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

  // Only request JSON format when caller expects it (not for Advisor)
  if (options.json !== false) {
    body.response_format = { type: 'json_object' }
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('OPENROUTER_API_KEY')}`,
    },
    body: JSON.stringify(body),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`OpenRouter error (${response.status}): ${error}`)
  }

  const data = await response.json()
  const content = data.choices[0].message.content
  const usage = data.usage

  return {
    content: options.json !== false ? JSON.parse(content) : content,
    tokens: usage?.total_tokens ?? 0,
    model: data.model,
  }
}
