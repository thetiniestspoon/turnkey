import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const RATE_LIMIT_MAX = 3
const RATE_LIMIT_WINDOW_MINUTES = 5

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(pin)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b: number) => b.toString(16).padStart(2, '0')).join('')
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    const { emoji_pin } = await req.json()

    if (!emoji_pin || typeof emoji_pin !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Missing emoji_pin' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get caller IP for rate limiting
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
      || req.headers.get('cf-connecting-ip')
      || 'unknown'

    // Check rate limit
    const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MINUTES * 60 * 1000).toISOString()
    const { count } = await supabaseAdmin
      .from('emoji_pin_attempts')
      .select('*', { count: 'exact', head: true })
      .eq('ip_address', ip)
      .eq('success', false)
      .gte('attempted_at', windowStart)

    if ((count ?? 0) >= RATE_LIMIT_MAX) {
      return new Response(
        JSON.stringify({ error: 'Too many attempts. Try again in 5 minutes.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Hash the submitted PIN
    const pinHash = await hashPin(emoji_pin)

    // Look up user by PIN hash
    const { data: profile } = await supabaseAdmin
      .from('user_profiles')
      .select('user_id')
      .eq('emoji_pin_hash', pinHash)
      .single()

    if (!profile) {
      // Log failed attempt
      await supabaseAdmin.from('emoji_pin_attempts').insert({ ip_address: ip, success: false })
      return new Response(
        JSON.stringify({ error: 'Invalid PIN' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get user email
    const { data: { user } } = await supabaseAdmin.auth.admin.getUserById(profile.user_id)

    if (!user?.email) {
      return new Response(
        JSON.stringify({ error: 'User not found' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Generate a magic link token (not sent via email - we use it directly)
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'magiclink',
      email: user.email,
    })

    if (linkError || !linkData) {
      return new Response(
        JSON.stringify({ error: 'Failed to generate session' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Log successful attempt
    await supabaseAdmin.from('emoji_pin_attempts').insert({ ip_address: ip, success: true })

    // Return the token hash and email for client-side OTP verification
    const url = new URL(linkData.properties.action_link)
    const tokenHash = url.searchParams.get('token_hash') || url.hash

    return new Response(
      JSON.stringify({
        token_hash: linkData.properties.hashed_token,
        email: user.email,
        type: 'magiclink',
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (err) {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
