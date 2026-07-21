import type { BacktestResult } from './backtest'
import type { ReliabilityGap } from './calibrate'

// A band needs at least this many decisions before it is worth naming. Two decisions
// that both went badly produce a spectacular-looking gap and mean nothing; quoting one
// as "where the model was wrong" sends a reader chasing noise.
export const MIN_BAND_N = 3

// Rank by n × gap², not by |gap|. That product is each band's contribution to the
// reliability term — i.e. how much damage it actually does to the score — so the band
// this names is the one worth fixing first.
export function pickWorstBand(gaps: readonly ReliabilityGap[]): ReliabilityGap | null {
  const eligible = gaps.filter((g) => g.n >= MIN_BAND_N)
  if (eligible.length === 0) return null
  return [...eligible].sort((a, b) => b.n * b.gap ** 2 - a.n * a.gap ** 2)[0]
}

// The account a person actually reads.
//
// The rule this file follows: never print a number without printing what it means and
// what would make it untrustworthy. A backtest that emits "0.187" and nothing else
// invites someone to act on a figure whose provenance they cannot see.

const pct = (x: number) => (Number.isFinite(x) ? `${x >= 0 ? '+' : ''}${x.toFixed(1)}%` : 'n/a')
const num = (x: number, d = 4) => (Number.isFinite(x) ? x.toFixed(d) : 'n/a')

function bar(width: number): string {
  return '─'.repeat(width)
}

export function renderTextReport(r: BacktestResult): string {
  const L: string[] = []
  const h = r.headline

  L.push(bar(72))
  L.push('TURNKEY — DECISION SIMULATION & BACKTEST')
  L.push(bar(72))
  L.push(`corpus     ${r.corpus.id}  (${r.corpus.count} properties, as of ${r.as_of})`)
  L.push(`run        ${r.run_id.slice(0, 16)}   engine ${r.engine_version}   seed ${r.seed}`)
  L.push(`policy     ${r.policy.name} — flip hurdle ${r.policy.hurdle.flip_roi_min}%, cap hurdle ${r.policy.hurdle.rental_cap_rate_min}%, confidence floor ${r.policy.confidence_floor}`)
  L.push('')

  if (r.corpus.synthetic) {
    L.push('!! SYNTHETIC CORPUS — NOT REAL LISTINGS !!')
    L.push('   These numbers measure whether the harness detects bias that was')
    L.push('   deliberately planted. They say NOTHING about the real Turnkey analyst.')
    L.push('   Planted biases in this corpus:')
    for (const b of r.corpus.planted_biases) L.push(`     - ${b}`)
    L.push('')
  }

  L.push(bar(72))
  L.push('CALIBRATION')
  L.push(bar(72))
  L.push(`Evaluated on the ${h.evaluated_on} half (${h.n} decisions). The calibration map was`)
  L.push(`fitted on the other ${r.split_sizes.fit}, so this score is out-of-sample.`)
  L.push('')
  L.push(`  Brier score, uncalibrated    ${num(h.brier_uncalibrated)}   <- the headline number`)
  L.push(`  Brier score, calibrated      ${num(h.brier_calibrated)}`)
  L.push(`  improvement from feedback    ${num(h.delta)}   ${h.delta > 0 ? '(calibration helped)' : '(calibration did not help)'}`)
  L.push(`  Brier skill score            ${num(h.brier_skill_score)}   ${h.brier_skill_score > 0 ? '(beats the base rate)' : '(no better than the base rate)'}`)
  L.push(`  reliability, uncalibrated    ${num(h.reliability_uncalibrated)}   <- the part calibration can remove`)
  L.push(`  reliability, calibrated      ${num(h.reliability_calibrated)}`)
  L.push(`  base rate (deals that cleared their hurdle)  ${pct(h.base_rate * 100)}`)
  L.push('')
  L.push('  0 is a perfect forecaster; 0.25 is someone who always says "50/50";')
  L.push('  1 is confidently wrong every time.')
  L.push('')

  L.push(bar(72))
  L.push('WHERE THE MODEL WAS WRONG')
  L.push(bar(72))

  // 1. The worst-calibrated bucket, by damage done rather than by raw gap size.
  const worst = pickWorstBand(r.reliability_gaps)
  if (worst) {
    const dir = worst.gap < 0 ? 'OVERconfident' : 'UNDERconfident'
    L.push(`Worst-calibrated confidence band: ${(worst.lo * 100).toFixed(0)}-${(worst.hi * 100).toFixed(0)}.`)
    L.push(`  ${worst.n} decisions landed there carrying an average confidence of ${(worst.mean_p * 100).toFixed(0)},`)
    L.push(`  and ${(worst.observed * 100).toFixed(0)}% of them actually cleared their hurdle —`)
    L.push(`  the model is ${dir} by ${Math.abs(worst.gap * 100).toFixed(0)} points in that band.`)
    L.push(`  (Next run, decisions in that band will be re-scored to ${(worst.smoothed * 100).toFixed(0)}%, which is the`)
    L.push('   observed rate pulled slightly back toward the original forecast so a thin')
    L.push('   band cannot yank future decisions around.)')
  } else {
    L.push(`No confidence band held at least ${MIN_BAND_N} decisions, so calibration cannot be assessed.`)
    L.push('  This is a statement about the corpus being too small, not about the model.')
  }
  L.push('')

  // 2. The metric with the largest signed bias.
  const metrics = Object.entries(r.metric_errors)
    .filter(([, e]) => Number.isFinite(e.bias_pct))
    .sort((a, b) => Math.abs(b[1].bias_pct) - Math.abs(a[1].bias_pct))
  if (metrics.length) {
    const [name, e] = metrics[0]
    const dir = e.bias_pct < 0 ? 'under-forecast' : 'over-forecast'
    L.push(`Largest systematic error: ${name}.`)
    L.push(`  The analyst ${dir}s it by ${Math.abs(e.bias_pct).toFixed(1)}% on average (MAPE ${e.mape_pct.toFixed(1)}%, n=${e.n}).`)
    L.push('  Signed bias is the number that matters here: an unbiased model with a large')
    L.push('  MAPE is noisy, but a biased one is wrong in the same direction every time.')
    L.push('')
    L.push('  All metrics:')
    for (const [n2, e2] of Object.entries(r.metric_errors)) {
      L.push(`    ${n2.padEnd(16)} bias ${pct(e2.bias_pct).padStart(7)}   MAPE ${pct(e2.mape_pct).padStart(7)}   n=${e2.n}`)
    }
  }
  L.push('')

  // 3. Decision quality.
  const c = r.confusion
  L.push('Decision outcomes on the holdout half:')
  L.push(`    bought and cleared   ${c.hit}`)
  L.push(`    bought and failed    ${c.false_buy}   <- false buys, the expensive quadrant`)
  L.push(`    passed but cleared   ${c.miss}   <- missed deals`)
  L.push(`    passed and failed    ${c.correct_pass}`)
  L.push(`    precision on buys    ${Number.isFinite(c.buy_precision) ? `${(c.buy_precision * 100).toFixed(0)}%` : 'n/a (bought nothing)'}`)
  L.push('')
  L.push(`Notional capital across the WHOLE corpus (both halves): $${r.capital.deployed.toLocaleString('en-US')} over ${r.capital.positions} buys.`)
  L.push('  Notional because nothing here models holding periods, financing or timing, so')
  L.push('  these buys are not concurrent positions and this is not a portfolio result.')
  L.push('  That omission is deliberate — see the rejected design in the spec.')
  L.push('')

  // 4. The costliest false buys, named.
  const falseBuys = r.ledger
    .filter((row) => row.action === 'buy' && !row.cleared)
    .sort((a, b) => b.shortfall - a.shortfall)
  if (falseBuys.length) {
    L.push(`Costliest false buys (underwrote above the hurdle, came in below it):`)
    for (const row of falseBuys.slice(0, 3)) {
      L.push(`    ${row.property_id.slice(0, 8)}  ${row.strategy.padEnd(6)} underwrote ${row.underwritten_return.toFixed(1)}%, realized ${row.realized_return.toFixed(1)}% — short by ${row.shortfall.toFixed(1)} points (confidence ${row.confidence_raw}, ended ${row.terminal_status})`)
    }
    L.push('')
    const byStatus = new Map<string, number>()
    for (const row of falseBuys) byStatus.set(row.terminal_status, (byStatus.get(row.terminal_status) ?? 0) + 1)
    const parts = [...byStatus.entries()].sort().map(([s, n]) => `${n} ${s}`)
    L.push(`  False buys by terminal status: ${parts.join(', ')}.`)
    L.push('  Status is reported but not scored — a property that never left `active` was')
    L.push('  arguably never transactable, which the return number alone cannot tell you.')
  } else {
    L.push('No false buys on the holdout half.')
  }
  L.push('')
  L.push(bar(72))

  return L.join('\n')
}

export function renderJsonReport(r: BacktestResult): string {
  return JSON.stringify(r, null, 2)
}
