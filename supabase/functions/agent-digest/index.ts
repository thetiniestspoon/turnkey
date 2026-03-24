import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createAdminClient } from '../_shared/supabase-admin.ts'
import { corsHeaders } from '../_shared/cors.ts'

// ─── Types ───────────────────────────────────────────────────────────────────

interface Property {
  id: string
  address: string
  city: string
  state: string
  zip: string
  list_price: number
  raw_data: {
    score?: number
    recommended_strategy?: string
    listing_url?: string
    image_url?: string
  } | null
  market_status: string | null
  stale_at: string | null
  created_at: string
}

interface UserRecommendation {
  user_id: string
  property_id: string
  created_at: string
  properties: Property
}

interface StatusHistory {
  property_id: string
  status: string
  checked_at: string
  source: string
}

interface AgentRunStat {
  agent_type: string
  count: number
  total_cost: number
}

interface DigestData {
  newByZip: { zip: string; count: number }[]
  newTotalCount: number
  recommendations: UserRecommendation[]
  offMarket: StatusHistory[]
  staleProperties: Property[]
  topProperties: Property[]
  agentStats: AgentRunStat[]
}

// ─── HTML builder ────────────────────────────────────────────────────────────

function formatPrice(price: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(price)
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function buildDigestHtml(data: DigestData, weekStart: string, weekEnd: string): string {
  const {
    newByZip,
    newTotalCount,
    recommendations,
    offMarket,
    staleProperties,
    topProperties,
    agentStats,
  } = data

  const totalCost = agentStats.reduce((sum, s) => sum + (s.total_cost || 0), 0)
  const totalRuns = agentStats.reduce((sum, s) => sum + (s.count || 0), 0)

  // ── Ones to Watch rows ──
  const topRows = topProperties.length
    ? topProperties.map(p => {
        const score = p.raw_data?.score ?? '—'
        const strategy = p.raw_data?.recommended_strategy ?? '—'
        const url = p.raw_data?.listing_url
        const addressDisplay = url
          ? `<a href="${url}" style="color:#1a56db;text-decoration:none;">${p.address}</a>`
          : p.address
        return `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">
            ${addressDisplay}<br>
            <span style="font-size:12px;color:#6b7280;">${p.city}, ${p.state} ${p.zip}</span>
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;white-space:nowrap;">
            ${formatPrice(p.list_price)}
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;text-align:center;">
            <span style="display:inline-block;background:${(score as number) >= 80 ? '#d1fae5' : '#fef3c7'};color:${(score as number) >= 80 ? '#065f46' : '#92400e'};padding:2px 8px;border-radius:9999px;font-size:12px;font-weight:600;">
              ${score}
            </span>
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;text-transform:capitalize;">
            ${strategy}
          </td>
        </tr>`
      }).join('')
    : `<tr><td colspan="4" style="padding:16px;text-align:center;color:#9ca3af;font-size:14px;">No new high-scored properties this week.</td></tr>`

  // ── Recommended rows ──
  const recRows = recommendations.length
    ? recommendations.map(r => {
        const p = r.properties
        const score = p.raw_data?.score ?? '—'
        const strategy = p.raw_data?.recommended_strategy ?? '—'
        const url = p.raw_data?.listing_url
        const addressDisplay = url
          ? `<a href="${url}" style="color:#1a56db;text-decoration:none;">${p.address}</a>`
          : p.address
        return `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">
            ${addressDisplay}<br>
            <span style="font-size:12px;color:#6b7280;">${p.city}, ${p.state} ${p.zip}</span>
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;white-space:nowrap;">
            ${formatPrice(p.list_price)}
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;text-align:center;">
            <span style="display:inline-block;background:${(score as number) >= 80 ? '#d1fae5' : '#fef3c7'};color:${(score as number) >= 80 ? '#065f46' : '#92400e'};padding:2px 8px;border-radius:9999px;font-size:12px;font-weight:600;">
              ${score}
            </span>
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;text-transform:capitalize;">
            ${strategy}
          </td>
        </tr>`
      }).join('')
    : `<tr><td colspan="4" style="padding:16px;text-align:center;color:#9ca3af;font-size:14px;">No new recommendations this week.</td></tr>`

  // ── Market movements rows ──
  const movementRows = offMarket.length
    ? offMarket.map(h => {
        const statusLabel = h.status === 'sold' ? 'Sold' : 'Off Market'
        const badgeBg = h.status === 'sold' ? '#fee2e2' : '#fef3c7'
        const badgeColor = h.status === 'sold' ? '#991b1b' : '#92400e'
        return `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">
            Property ID: <code style="background:#f3f4f6;padding:2px 6px;border-radius:4px;font-size:12px;">${h.property_id.slice(0, 8)}…</code>
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;">
            <span style="display:inline-block;background:${badgeBg};color:${badgeColor};padding:2px 8px;border-radius:9999px;font-size:12px;font-weight:600;">
              ${statusLabel}
            </span>
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;">
            ${formatDate(h.checked_at)}
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;text-transform:capitalize;">
            ${h.source}
          </td>
        </tr>`
      }).join('')
    : `<tr><td colspan="4" style="padding:16px;text-align:center;color:#9ca3af;font-size:14px;">No market movement changes this week.</td></tr>`

  // ── Stale alerts rows ──
  const staleRows = staleProperties.length
    ? staleProperties.map(p => {
        const staleDate = p.stale_at ? formatDate(p.stale_at) : '—'
        return `
        <tr>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;">
            ${p.address}<br>
            <span style="font-size:12px;color:#6b7280;">${p.city}, ${p.state} ${p.zip}</span>
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;white-space:nowrap;">
            ${formatPrice(p.list_price)}
          </td>
          <td style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#dc2626;">
            Stale since ${staleDate}
          </td>
        </tr>`
      }).join('')
    : `<tr><td colspan="3" style="padding:16px;text-align:center;color:#9ca3af;font-size:14px;">No stale pipeline items.</td></tr>`

  // ── Agent stats rows ──
  const agentRows = agentStats.length
    ? agentStats.map(s => `
        <tr>
          <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;text-transform:capitalize;">
            ${s.agent_type}
          </td>
          <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;text-align:right;">
            ${s.count} runs
          </td>
          <td style="padding:10px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#374151;text-align:right;">
            $${(s.total_cost || 0).toFixed(4)}
          </td>
        </tr>`).join('')
    : `<tr><td colspan="3" style="padding:16px;text-align:center;color:#9ca3af;font-size:14px;">No agent runs recorded this week.</td></tr>`

  // ── New properties by ZIP summary ──
  const zipSummary = newByZip.length
    ? newByZip.map(z => `<span style="display:inline-block;margin:2px 4px;background:#e0e7ff;color:#3730a3;padding:3px 10px;border-radius:9999px;font-size:12px;font-weight:600;">${z.zip} (${z.count})</span>`).join('')
    : '<span style="font-size:13px;color:#9ca3af;">No new properties this week.</span>'

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Turnkey Weekly Digest</title>
</head>
<body style="margin:0;padding:0;background-color:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">

  <!-- Wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="background:#111827;border-radius:8px 8px 0 0;padding:32px 32px 24px;">
              <p style="margin:0 0 4px;font-size:11px;letter-spacing:2px;color:#9ca3af;text-transform:uppercase;">Weekly Intelligence Report</p>
              <h1 style="margin:0 0 8px;font-size:26px;font-weight:700;color:#ffffff;">Turnkey</h1>
              <p style="margin:0;font-size:13px;color:#6b7280;">${weekStart} — ${weekEnd}</p>
            </td>
          </tr>

          <!-- Stats bar -->
          <tr>
            <td style="background:#1f2937;padding:16px 32px;">
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td style="text-align:center;border-right:1px solid #374151;padding:0 16px 0 0;">
                    <p style="margin:0;font-size:24px;font-weight:700;color:#60a5fa;">${newTotalCount}</p>
                    <p style="margin:4px 0 0;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">New Scouted</p>
                  </td>
                  <td style="text-align:center;border-right:1px solid #374151;padding:0 16px;">
                    <p style="margin:0;font-size:24px;font-weight:700;color:#34d399;">${recommendations.length}</p>
                    <p style="margin:4px 0 0;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Recommended</p>
                  </td>
                  <td style="text-align:center;border-right:1px solid #374151;padding:0 16px;">
                    <p style="margin:0;font-size:24px;font-weight:700;color:#f87171;">${offMarket.length}</p>
                    <p style="margin:4px 0 0;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Off Market</p>
                  </td>
                  <td style="text-align:center;padding:0 0 0 16px;">
                    <p style="margin:0;font-size:24px;font-weight:700;color:#fbbf24;">${staleProperties.length}</p>
                    <p style="margin:4px 0 0;font-size:11px;color:#9ca3af;text-transform:uppercase;letter-spacing:1px;">Stale Alerts</p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="background:#ffffff;padding:0;">

              <!-- ZIP Activity -->
              <div style="padding:24px 32px;border-bottom:1px solid #e5e7eb;">
                <h2 style="margin:0 0 12px;font-size:14px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:1px;">New Properties by ZIP</h2>
                <div>${zipSummary}</div>
              </div>

              <!-- Ones to Watch -->
              <div style="padding:24px 32px 0;border-bottom:1px solid #e5e7eb;">
                <h2 style="margin:0 0 4px;font-size:14px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:1px;">Top Scored This Week</h2>
                <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">Highest-scored properties found by the Scout Agent</p>
                <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;border-collapse:collapse;">
                  <thead>
                    <tr style="background:#f9fafb;">
                      <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Address</th>
                      <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Price</th>
                      <th style="padding:10px 16px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Score</th>
                      <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Strategy</th>
                    </tr>
                  </thead>
                  <tbody>${topRows}</tbody>
                </table>
              </div>

              <!-- Recommendations -->
              <div style="padding:24px 32px 0;border-bottom:1px solid #e5e7eb;">
                <h2 style="margin:0 0 4px;font-size:14px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:1px;">Ones to Watch</h2>
                <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">Properties newly recommended for your watchlist this week</p>
                <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;border-collapse:collapse;">
                  <thead>
                    <tr style="background:#f9fafb;">
                      <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Address</th>
                      <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Price</th>
                      <th style="padding:10px 16px;text-align:center;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Score</th>
                      <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Strategy</th>
                    </tr>
                  </thead>
                  <tbody>${recRows}</tbody>
                </table>
              </div>

              <!-- Market Movements -->
              <div style="padding:24px 32px 0;border-bottom:1px solid #e5e7eb;">
                <h2 style="margin:0 0 4px;font-size:14px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:1px;">Market Movements</h2>
                <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">Properties that went off-market or sold this week</p>
                <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;border-collapse:collapse;">
                  <thead>
                    <tr style="background:#f9fafb;">
                      <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Property</th>
                      <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Status</th>
                      <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Detected</th>
                      <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Source</th>
                    </tr>
                  </thead>
                  <tbody>${movementRows}</tbody>
                </table>
              </div>

              <!-- Stale Alerts -->
              <div style="padding:24px 32px 0;border-bottom:1px solid #e5e7eb;">
                <h2 style="margin:0 0 4px;font-size:14px;font-weight:700;color:#111827;text-transform:uppercase;letter-spacing:1px;">Stale Alerts</h2>
                <p style="margin:0 0 16px;font-size:13px;color:#6b7280;">Pipeline items that have gone stale with no recent activity</p>
                <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;border-collapse:collapse;">
                  <thead>
                    <tr style="background:#f9fafb;">
                      <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Property</th>
                      <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Price</th>
                      <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Status</th>
                    </tr>
                  </thead>
                  <tbody>${staleRows}</tbody>
                </table>
              </div>

            </td>
          </tr>

          <!-- Agent Activity Footer -->
          <tr>
            <td style="background:#f9fafb;border:1px solid #e5e7eb;border-top:none;padding:24px 32px;border-radius:0 0 8px 8px;">
              <h2 style="margin:0 0 12px;font-size:13px;font-weight:700;color:#374151;text-transform:uppercase;letter-spacing:1px;">Agent Activity This Week</h2>
              <table width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:6px;overflow:hidden;border-collapse:collapse;background:#ffffff;">
                <thead>
                  <tr style="background:#f9fafb;">
                    <th style="padding:10px 16px;text-align:left;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Agent</th>
                    <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Runs</th>
                    <th style="padding:10px 16px;text-align:right;font-size:11px;font-weight:600;color:#6b7280;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #e5e7eb;">Est. Cost</th>
                  </tr>
                </thead>
                <tbody>
                  ${agentRows}
                  <tr style="background:#f9fafb;">
                    <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#111827;">Total</td>
                    <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#111827;text-align:right;">${totalRuns}</td>
                    <td style="padding:10px 16px;font-size:13px;font-weight:600;color:#111827;text-align:right;">$${totalCost.toFixed(4)}</td>
                  </tr>
                </tbody>
              </table>
              <p style="margin:16px 0 0;font-size:12px;color:#9ca3af;text-align:center;">
                Turnkey Real Estate Intelligence &nbsp;·&nbsp; Generated ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })} ET
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>

</body>
</html>`
}

// ─── Main handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const supabase = createAdminClient()
  const startedAt = new Date().toISOString()

  const { data: run } = await supabase.from('agent_runs').insert({
    agent_type: 'digest',
    trigger: 'cron',
    started_at: startedAt,
    status: 'running',
  }).select().single()

  const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY')
  if (!RESEND_API_KEY) {
    console.warn('[agent-digest] RESEND_API_KEY is not set — emails will be skipped.')
  }

  try {
    // Date range: past 7 days
    const weekEnd = new Date()
    const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000)
    const weekStartISO = weekStart.toISOString()

    const weekStartLabel = weekStart.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    const weekEndLabel = weekEnd.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })

    // ── 1. New properties by ZIP ──────────────────────────────────────────────
    const { data: newPropsRaw, error: newPropsErr } = await supabase
      .from('properties')
      .select('zip')
      .gt('created_at', weekStartISO)

    if (newPropsErr) throw new Error(`properties query failed: ${newPropsErr.message}`)

    const zipCounts: Record<string, number> = {}
    for (const row of newPropsRaw || []) {
      zipCounts[row.zip] = (zipCounts[row.zip] || 0) + 1
    }
    const newByZip = Object.entries(zipCounts).map(([zip, count]) => ({ zip, count }))
      .sort((a, b) => b.count - a.count)
    const newTotalCount = (newPropsRaw || []).length

    // ── 2. New recommendations ────────────────────────────────────────────────
    const { data: recsRaw, error: recsErr } = await supabase
      .from('user_recommendations')
      .select(`
        user_id,
        property_id,
        created_at,
        properties (
          id, address, city, state, zip, list_price, raw_data, market_status, stale_at, created_at
        )
      `)
      .gt('created_at', weekStartISO)
      .eq('recommended', true)

    if (recsErr) throw new Error(`user_recommendations query failed: ${recsErr.message}`)

    // ── 3. Gone off-market or sold ────────────────────────────────────────────
    const { data: offMarketRaw, error: offMarketErr } = await supabase
      .from('property_status_history')
      .select('property_id, status, checked_at, source')
      .in('status', ['off_market', 'sold'])
      .gt('checked_at', weekStartISO)

    if (offMarketErr) throw new Error(`property_status_history query failed: ${offMarketErr.message}`)

    // ── 4. Stale properties ────────────────────────────────────────────────────
    const { data: staleRaw, error: staleErr } = await supabase
      .from('properties')
      .select('id, address, city, state, zip, list_price, raw_data, market_status, stale_at, created_at')
      .not('stale_at', 'is', null)

    if (staleErr) throw new Error(`stale properties query failed: ${staleErr.message}`)

    // ── 5. Top 3 highest-scored new properties ─────────────────────────────────
    const { data: allNewProps, error: topErr } = await supabase
      .from('properties')
      .select('id, address, city, state, zip, list_price, raw_data, market_status, stale_at, created_at')
      .gt('created_at', weekStartISO)

    if (topErr) throw new Error(`top properties query failed: ${topErr.message}`)

    const topProperties = (allNewProps || [])
      .filter(p => p.raw_data?.score != null)
      .sort((a, b) => (b.raw_data?.score ?? 0) - (a.raw_data?.score ?? 0))
      .slice(0, 3)

    // ── 6. Agent run stats ─────────────────────────────────────────────────────
    const { data: runsRaw, error: runsErr } = await supabase
      .from('agent_runs')
      .select('agent_type, cost_est')
      .gt('started_at', weekStartISO)

    if (runsErr) throw new Error(`agent_runs query failed: ${runsErr.message}`)

    const statMap: Record<string, { count: number; total_cost: number }> = {}
    for (const row of runsRaw || []) {
      if (!statMap[row.agent_type]) statMap[row.agent_type] = { count: 0, total_cost: 0 }
      statMap[row.agent_type].count += 1
      statMap[row.agent_type].total_cost += row.cost_est || 0
    }
    const agentStats: AgentRunStat[] = Object.entries(statMap).map(([agent_type, s]) => ({
      agent_type,
      count: s.count,
      total_cost: s.total_cost,
    }))

    // ── 7. Get active watchlist users ──────────────────────────────────────────
    const { data: watchlistUsers, error: watchlistErr } = await supabase
      .from('watchlists')
      .select('user_id')
      .eq('active', true)

    if (watchlistErr) throw new Error(`watchlists query failed: ${watchlistErr.message}`)

    // Deduplicate user IDs
    const userIds = [...new Set((watchlistUsers || []).map(w => w.user_id))]

    let emailsSent = 0
    let emailsSkipped = 0

    for (const userId of userIds) {
      // Get user email from auth.users via admin API
      const { data: { user }, error: userErr } = await supabase.auth.admin.getUserById(userId)
      if (userErr || !user?.email) {
        console.warn(`[agent-digest] Could not fetch email for user ${userId}: ${userErr?.message}`)
        emailsSkipped++
        continue
      }

      const userEmail = user.email

      // Filter recommendations to this user
      const userRecs = (recsRaw || []).filter(r => r.user_id === userId) as unknown as UserRecommendation[]

      const digestData: DigestData = {
        newByZip,
        newTotalCount,
        recommendations: userRecs,
        offMarket: offMarketRaw || [],
        staleProperties: staleRaw || [],
        topProperties,
        agentStats,
      }

      const digestHtml = buildDigestHtml(digestData, weekStartLabel, weekEndLabel)
      const recCount = userRecs.length
      const subject = `Turnkey Weekly — ${newTotalCount} new properties, ${recCount} recommended`

      if (!RESEND_API_KEY) {
        console.warn(`[agent-digest] Skipping email to ${userEmail} (no RESEND_API_KEY)`)
        emailsSkipped++
        continue
      }

      const sendResp = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: 'Turnkey <digest@turnkey-rosy.vercel.app>',
          to: [userEmail],
          subject,
          html: digestHtml,
        }),
      })

      if (!sendResp.ok) {
        const errText = await sendResp.text()
        console.error(`[agent-digest] Resend error for ${userEmail} (${sendResp.status}): ${errText}`)
        emailsSkipped++
      } else {
        emailsSent++
      }
    }

    const outputSummary = `Digest sent: ${emailsSent} emails, ${emailsSkipped} skipped. New: ${newTotalCount}, Recommended: ${(recsRaw || []).length}, Off-market: ${(offMarketRaw || []).length}, Stale: ${(staleRaw || []).length}`

    await supabase.from('agent_runs').update({
      status: 'success',
      completed_at: new Date().toISOString(),
      output_summary: outputSummary,
      cost_est: 0,
      input_summary: `Week: ${weekStartLabel} – ${weekEndLabel}, Users: ${userIds.length}`,
    }).eq('id', run?.id)

    return new Response(JSON.stringify({
      success: true,
      emailsSent,
      emailsSkipped,
      users: userIds.length,
      stats: { newTotalCount, recommendations: (recsRaw || []).length, offMarket: (offMarketRaw || []).length, stale: (staleRaw || []).length },
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    console.error('[agent-digest] Fatal error:', error)

    await supabase.from('agent_runs').update({
      status: 'error',
      completed_at: new Date().toISOString(),
      output_summary: error.message,
    }).eq('id', run?.id)

    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
