import type { Observation } from '@/schemas/simulation'

// ─────────────────────────────────────────────────────────────────────────────
// THE LIVE DATA SEAM — the one place this harness could ever touch real data.
//
// Everything else in scripts/sim/** is offline by construction: it reads checked-in
// JSON and computes. This file is the single, deliberate exception, and it is closed.
//
// The gate is a BOOLEAN PRESENCE CHECK on one env var. It reads no key, logs no
// value, and interpolates nothing into any message. There is no placeholder anywhere
// in this file that could be mistaken for a value to paste — that is not stylistic
// caution, it is the direct lesson of 2026-07-12, when a placeholder with an ellipsis
// in it led to a live service-role key being pasted into a transcript and rotated.
//
// Opening this seam is a reviewed code change, not a config flip. Setting the env var
// alone does not grant access to anything; it only routes to a function that throws
// until someone implements it on purpose.
// ─────────────────────────────────────────────────────────────────────────────

export const LIVE_SOURCE_ENV_VAR = 'TURNKEY_SIM_LIVE_SOURCE'

export function liveSourceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env[LIVE_SOURCE_ENV_VAR]
  return typeof v === 'string' && v.trim().length > 0
}

export function resolveSource(env: NodeJS.ProcessEnv = process.env): 'fixture' | 'live' {
  return liveSourceEnabled(env) ? 'live' : 'fixture'
}

// Deliberately unimplemented. When it is implemented it will read scouted properties
// and their recorded analyses out of Supabase — which requires the service-role key
// that has been the WS3 blocker since 2026-07-17.
export async function loadLiveObservations(): Promise<Observation[]> {
  throw new Error(
    [
      `${LIVE_SOURCE_ENV_VAR} is set, but the live seam is not wired.`,
      'One operator step remains first: add a SUPABASE_SERVICE_ROLE_KEY line to turnkey/.env,',
      'by hand, in an editor, from the project API settings page:',
      'https://supabase.com/dashboard/project/xebulbfhwyezjrqobzow/settings/api',
      'Then implement loadLiveObservations() to read properties + property_analyses.',
      'Until both are done the harness replays the checked-in fixture corpus.',
    ].join(' '),
  )
}
