import { loadEnv, assertServiceRoleKey } from './lib/env'
import { createAdminClient } from './lib/db'
import { runScout } from './lib/scout'

export const CAPS = { watchlists: 3, analyst: 10, marks: 15 }

export function parseArgs(argv: string[]): { dryRun: boolean; stage: string | null; watchlist: string | null } {
  let dryRun = false, stage: string | null = null, watchlist: string | null = null
  for (const a of argv) {
    if (a === '--dry-run') dryRun = true
    else if (a.startsWith('--stage=')) stage = a.slice('--stage='.length)
    else if (a.startsWith('--watchlist=')) watchlist = a.slice('--watchlist='.length)
  }
  return { dryRun, stage, watchlist }
}

export function isAutonomyOff(env: NodeJS.ProcessEnv): boolean {
  return !!env.TURNKEY_AUTONOMY_OFF && env.TURNKEY_AUTONOMY_OFF.length > 0
}

export function selectActiveWatchlists<T extends { active: boolean }>(rows: T[], cap: number): T[] {
  return rows.filter((r) => r.active).slice(0, cap)
}

export async function main(): Promise<number> {
  loadEnv()
  const args = parseArgs(process.argv.slice(2))
  const stamp = new Date().toISOString()
  console.log(`\n🏠 Turnkey nightly — ${stamp} ${args.dryRun ? '(DRY RUN)' : ''}`)

  if (isAutonomyOff(process.env)) {
    console.log('   TURNKEY_AUTONOMY_OFF set — skipping all stages. Exit 0.')
    return 0
  }

  const { url, key } = assertServiceRoleKey(process.env)
  const db = createAdminClient(process.env)

  // ── Stage: scout ─────────────────────────────────────────────
  if (!args.stage || args.stage === 'scout') {
    const q = db.from('watchlists').select('id, name, zip, user_id, active, criteria_overrides')
    const { data: wlAll, error } = args.watchlist ? await q.eq('id', args.watchlist) : await q
    if (error) { console.error(`   watchlists query failed: ${error.message}`); return 1 }
    const watchlists = selectActiveWatchlists((wlAll ?? []) as Array<{ active: boolean; id: string; zip: string; name: string }>, CAPS.watchlists)
    console.log(`   scout: ${watchlists.length} active watchlist(s) (cap ${CAPS.watchlists})`)
    for (const wl of watchlists) {
      try {
        const r = await runScout({ db, url, key, market: wl.zip, dryRun: args.dryRun })
        console.log(`   ✓ ${wl.name} (${wl.zip}): found ${r.found}, saved ${r.saved}`)
      } catch (e) {
        if ((e as { rateLimited?: boolean }).rateLimited) {
          console.log('   ⏸ quiet night (rate-limited during scout) — stopping, exit 0.')
          return 0
        }
        console.error(`   ✗ ${wl.name} (${wl.zip}): ${String((e as Error).message ?? e)}`)
      }
    }
  }

  // ── Phase 2 seam: analyst → market-check → recommendation → stale → tracker ──
  // (wired in Task 2.6)

  console.log('   done.')
  return 0
}

// Only run main() when executed directly, not when imported by tests.
const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('run-nightly.ts')
if (invokedDirectly) {
  main().then((code) => process.exit(code)).catch((e) => { console.error('nightly error:', e); process.exit(1) })
}
