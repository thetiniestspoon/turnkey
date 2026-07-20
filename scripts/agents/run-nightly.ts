import { loadEnv, assertServiceRoleKey } from './lib/env'
import { billingVarsPresent } from './lib/claude'
import { createAdminClient, hasAnalysis, latestAnalysisConfidence, resolvedPredictions } from './lib/db'
import { runScout } from './lib/scout'
import { runAnalyst } from './lib/analyst'
import { runMarketCheck } from './lib/market-check'
import { runTracker } from './lib/tracker'
import { mergeCriteria, passesFilter, shouldRecommend, upsertRecommendation, flagStale, type CriteriaFields } from './lib/orchestrate'

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

// Dedup key scoped per-user: the same physical property may be independently
// recommended to multiple users (per agent-autoscout/index.ts), so two
// watchlists targeting the same zip — whether different users or the same
// user's second watchlist — must each get a shot at evaluating a property.
// Only skip a property that THIS user has already picked up this run.
export function candidateKey(userId: string, propertyId: string): string {
  return `${userId}:${propertyId}`
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

  // Billing guard (June audit): callClaude scrubs these from the child env, so
  // a set ANTHROPIC_API_KEY can never flip a night to per-token billing — but
  // say so out loud, because a var like that in the scheduler's env is a
  // misconfiguration someone should fix at the source.
  const billing = billingVarsPresent(process.env)
  if (billing.length) {
    console.log(`   ⚠ ${billing.join(', ')} present in the environment — scrubbed for every claude spawn (subscription-only).`)
  }

  const { url, key } = assertServiceRoleKey(process.env)
  const db = createAdminClient(process.env)

  let scouted = 0, analyzed = 0, marked = 0, recommended = 0

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
        scouted += r.saved
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

  // ── Stage: analyst → market-check → recommend → stale → tracker ──────
  type CandidateProperty = {
    id: string; address: string; city: string; state: string; zip: string
    lat: number | null; lng: number | null
    list_price: number | null; property_type: string | null
    raw_data: Record<string, unknown> | null; market_status: string | null
  }
  type Candidate = { userId: string; property: CandidateProperty }

  if (args.dryRun) {
    console.log('   [dry-run] analyst/market-check/recommend/stale/tracker: skipping (no writes, no LLM calls)')
  } else if (!args.stage || args.stage === 'analyst' || args.stage === 'market-check' || args.stage === 'tracker') {
    // Gather candidates: properties scouted this run, filtered by each watchlist owner's
    // merged investment criteria (mergeCriteria/passesFilter port of agent-autoscout), then
    // gated by that user's auto_analyze_min_score (agent-orchestrator's processProperty gate).
    const candidates: Candidate[] = []
    const seen = new Set<string>()

    const q2 = db.from('watchlists').select('id, name, zip, user_id, active, criteria_overrides')
    const { data: wlAll2 } = args.watchlist ? await q2.eq('id', args.watchlist) : await q2
    const watchlists2 = selectActiveWatchlists(
      (wlAll2 ?? []) as Array<{ active: boolean; id: string; zip: string; user_id: string; criteria_overrides: CriteriaFields | null }>,
      CAPS.watchlists,
    )

    for (const wl of watchlists2) {
      const { data: criteriaRow } = await db
        .from('investment_criteria')
        .select('max_price, min_cap_rate, min_flip_roi, min_score, property_types, strategies, auto_analyze_min_score')
        .eq('user_id', wl.user_id)
        .maybeSingle()
      const globalCriteria: CriteriaFields | null = criteriaRow
        ? {
            max_price: criteriaRow.max_price, min_cap_rate: criteriaRow.min_cap_rate,
            min_flip_roi: criteriaRow.min_flip_roi, min_score: criteriaRow.min_score,
            property_types: criteriaRow.property_types, strategies: criteriaRow.strategies,
          }
        : null
      const merged = mergeCriteria(globalCriteria, wl.criteria_overrides ?? null)
      const minAnalyzeScore = criteriaRow?.auto_analyze_min_score ?? 60

      const { data: scoutedRows } = await db
        .from('properties')
        .select('id, address, city, state, zip, lat, lng, list_price, property_type, raw_data, market_status')
        .eq('zip', wl.zip)
        .eq('source', 'autoscout')
        .gte('updated_at', stamp)
      for (const p of (scoutedRows ?? []) as CandidateProperty[]) {
        const key = candidateKey(wl.user_id, p.id)
        if (seen.has(key) || !passesFilter(p, merged)) continue
        const score = (p.raw_data as { score?: number } | null)?.score ?? 0
        if (score < minAnalyzeScore) continue
        seen.add(key)
        candidates.push({ userId: wl.user_id, property: p })
      }
    }

    const analystBatch = candidates.slice(0, CAPS.analyst)
    console.log(`   pipeline: ${candidates.length} candidate propert${candidates.length === 1 ? 'y' : 'ies'} passed criteria (analyst cap ${CAPS.analyst})`)

    for (const c of analystBatch) {
      try {
        if (!(await hasAnalysis(db, c.property.id))) {
          await runAnalyst({ db, url, key, property: c.property })
        }
        analyzed++
        const mr = await runMarketCheck({ db, property: c.property })
        marked++
        const confidence = await latestAnalysisConfidence(db, c.property.id)
        if (shouldRecommend(mr.status, confidence)) {
          await upsertRecommendation(db, c.userId, c.property.id)
          recommended++
        }
      } catch (e) {
        if ((e as { rateLimited?: boolean }).rateLimited) {
          console.log('   ⏸ quiet night (rate-limited during analyst/market-check) — stopping, exit 0.')
          return 0
        }
        console.error(`   ✗ candidate ${c.property.address}: ${String((e as Error).message ?? e)}`)
      }
    }

    try {
      await flagStale(db)
    } catch (e) {
      console.error(`   ✗ flagStale: ${String((e as Error).message ?? e)}`)
    }

    // Market-check rotation: existing open properties, oldest-checked first, up to the
    // remainder of the nightly marks cap left after the candidate loop above.
    const remainingMarks = Math.max(0, CAPS.marks - marked)
    if (remainingMarks > 0) {
      const { data: rotation } = await db
        .from('properties')
        .select('id, address, city, state, zip, raw_data, market_status')
        .eq('market_status', 'active')
        .order('market_status_checked_at', { ascending: true, nullsFirst: true })
        .limit(remainingMarks)
      for (const p of (rotation ?? []) as Array<Omit<CandidateProperty, 'lat' | 'lng' | 'list_price' | 'property_type'>>) {
        try {
          await runMarketCheck({ db, property: p })
          marked++
        } catch (e) {
          if ((e as { rateLimited?: boolean }).rateLimited) {
            console.log('   ⏸ quiet night (rate-limited during market-check rotation) — stopping, exit 0.')
            return 0
          }
          console.error(`   ✗ rotation ${p.address}: ${String((e as Error).message ?? e)}`)
        }
      }
    }

    // Tracker: only for candidates that now have resolved predictions (runTracker itself
    // also short-circuits on zero, but checking here avoids a no-op agent_runs row per night).
    for (const c of analystBatch) {
      try {
        const preds = await resolvedPredictions(db, c.property.id)
        if (preds.length > 0) await runTracker({ db, property: c.property })
      } catch (e) {
        if ((e as { rateLimited?: boolean }).rateLimited) {
          console.log('   ⏸ quiet night (rate-limited during tracker) — stopping, exit 0.')
          return 0
        }
        console.error(`   ✗ tracker ${c.property.address}: ${String((e as Error).message ?? e)}`)
      }
    }
  }

  console.log(`   scouted ${scouted}, analyzed ${analyzed}, marked ${marked}, recommended ${recommended}`)
  console.log('   done.')
  return 0
}

// Only run main() when executed directly, not when imported by tests.
const invokedDirectly = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('run-nightly.ts')
if (invokedDirectly) {
  main().then((code) => process.exit(code)).catch((e) => { console.error('nightly error:', e); process.exit(1) })
}
