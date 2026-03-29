/**
 * Seed default emoji PINs for existing users.
 *
 * Run after users exist in auth.users:
 *   npx tsx scripts/seed-emoji-pins.ts
 *
 * Default PINs:
 *   Shawn (runx31021@gmail.com):  🦝🔑🏠💎
 *   Ted   (theodorelawson@gmail.com):   🦊🎯🚀⭐
 *
 * Requires SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars.
 */

import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY env vars')
  process.exit(1)
}

const supabase = createClient(SUPABASE_URL, SERVICE_KEY)

async function hashPin(pin: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(pin)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('')
}

const DEFAULT_PINS: { email: string; pin: string }[] = [
  { email: 'runx31021@gmail.com', pin: '🦝🔑🏠💎' },
  { email: 'theodorelawson@gmail.com', pin: '🦊🎯🚀⭐' },
]

async function seed() {
  for (const { email, pin } of DEFAULT_PINS) {
    // Find user by email
    const { data: { users } } = await supabase.auth.admin.listUsers()
    const user = users?.find((u) => u.email === email)

    if (!user) {
      console.log(`  Skipping ${email} — user not found in auth.users`)
      continue
    }

    const pinHash = await hashPin(pin)

    const { error } = await supabase.from('user_profiles').upsert({
      user_id: user.id,
      emoji_pin_hash: pinHash,
      emoji_pin_length: 4,
      pin_set_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })

    if (error) {
      console.error(`  Failed for ${email}:`, error.message)
    } else {
      console.log(`  ${email}: PIN set to ${pin}`)
    }
  }

  console.log('\nDone! Default emoji PINs seeded.')
}

seed()
