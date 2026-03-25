import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const EMOJI_PALETTE = [
  '🦝', '🦊', '🐻', '🦉', '🐙',
  '🦎', '🐋', '🦩', '🦚', '🐝',
  '🌵', '🌻', '🍄', '🌊', '🔥',
  '⭐', '🌙', '🎸', '🎲', '🔮',
  '🏠', '🔑', '💎', '🚀', '🎯',
]

const PIN_LENGTH = 4

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(pin)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b: number) => b.toString(16).padStart(2, '0')).join('')
}

function parseEmojis(str: string): string[] {
  // Use Intl.Segmenter to properly split emoji string into individual characters
  const segmenter = new Intl.Segmenter('en', { granularity: 'grapheme' })
  return Array.from(segmenter.segment(str), (s) => s.segment)
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify the user is authenticated
    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Verify JWT to get user
    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token)

    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const { new_emoji_pin } = await req.json()

    if (!new_emoji_pin || typeof new_emoji_pin !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing new_emoji_pin' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validate: exactly PIN_LENGTH emojis from the palette
    const emojis = parseEmojis(new_emoji_pin)

    if (emojis.length !== PIN_LENGTH) {
      return new Response(
        JSON.stringify({ error: `PIN must be exactly ${PIN_LENGTH} emojis` }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!emojis.every((e) => EMOJI_PALETTE.includes(e))) {
      return new Response(
        JSON.stringify({ error: 'PIN contains invalid emojis' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Hash and check uniqueness
    const pinHash = await hashPin(new_emoji_pin)

    const { data: existing } = await supabaseAdmin
      .from('user_profiles')
      .select('user_id')
      .eq('emoji_pin_hash', pinHash)
      .neq('user_id', user.id)
      .single()

    if (existing) {
      return new Response(
        JSON.stringify({ error: 'PIN already taken. Try a different combination.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Upsert the profile
    const { error: upsertError } = await supabaseAdmin
      .from('user_profiles')
      .upsert({
        user_id: user.id,
        emoji_pin_hash: pinHash,
        emoji_pin_length: PIN_LENGTH,
        pin_set_at: new Date().toISOString(),
      }, { onConflict: 'user_id' })

    if (upsertError) {
      return new Response(
        JSON.stringify({ error: 'Failed to update PIN' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    return new Response(
      JSON.stringify({ success: true }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
