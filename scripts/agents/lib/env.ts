const DASH = 'https://supabase.com/dashboard/project/xebulbfhwyezjrqobzow/settings/api'

export function isPlaceholder(v: string | undefined): boolean {
  if (!v || v.length < 8) return true
  if (/^your_/i.test(v)) return true
  if (/[<>]/.test(v)) return true
  if (/[^\x20-\x7e]/.test(v)) return true
  return false
}

export function loadEnv(): void {
  try {
    // Node 22 built-in; loads .env from cwd. Harness is always run from repo root.
    ;(process as unknown as { loadEnvFile: (p?: string) => void }).loadEnvFile()
  } catch {
    // .env absent, or already loaded — env vars may be set another way. Non-fatal.
  }
}

export function assertServiceRoleKey(env: NodeJS.ProcessEnv): { url: string; key: string } {
  const url = env.SUPABASE_URL || env.VITE_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY
  if (!url) throw new Error(`SUPABASE_URL missing — set it in .env. Get project settings at ${DASH}`)
  if (isPlaceholder(key) || (key && key.length < 20)) {
    throw new Error(`SUPABASE_SERVICE_ROLE_KEY missing or placeholder — paste the real key into .env from ${DASH}`)
  }
  return { url, key: key as string }
}
