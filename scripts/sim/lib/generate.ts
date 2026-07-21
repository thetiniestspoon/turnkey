import { mulberry32, type Rng } from './rng'
import { DEFAULT_POLICY, type InvestmentPolicy } from './policy'
import type { AnalystOutput } from '@/schemas/analyst-output'
import type { CorpusManifest, Outcome, SimProperty } from '@/schemas/simulation'

// ─────────────────────────────────────────────────────────────────────────────
// SYNTHETIC corpus generator.
//
// Turnkey has no offline archive of real listings with resolved outcomes, so the
// fixture corpus is generated. It is labelled synthetic in the manifest, in every
// report it produces, and here.
//
// The generator works by drawing a LATENT TRUTH for each property and then having a
// simulated analyst observe that truth imperfectly. The gap between the two is the
// thing the backtest is supposed to find. Two biases are planted on purpose:
//
//   1. RENOVATION UNDERESTIMATE — the analyst's renovation_est runs 10-40% below the
//      true cost. This is the classic failure mode of flip underwriting, and it makes
//      realized ROI fall systematically short of underwritten ROI.
//   2. TOP-END OVERCONFIDENCE — confidences above ~72 get an extra boost, so the
//      highest-confidence bucket is the worst-calibrated one.
//
// ARV is left roughly unbiased on purpose: a harness that flags everything as biased
// is useless, so the corpus contains one metric that is fine and one that is not, and
// the report has to tell them apart.
//
// BECAUSE THE BIAS WAS PLANTED, the resulting calibration number says nothing about
// the real Turnkey analyst. It says the harness detects bias that is present.
// ─────────────────────────────────────────────────────────────────────────────

const HEX = '0123456789abcdef'

function hex(rng: Rng, n: number): string {
  let s = ''
  for (let i = 0; i < n; i++) s += HEX[Math.floor(rng() * 16)]
  return s
}

// A v4-SHAPED id drawn from the seeded PRNG rather than crypto, so the corpus is
// reproducible. It must satisfy the UUID regex in the production analyst schema.
export function deterministicUuid(rng: Rng): string {
  const variant = '89ab'[Math.floor(rng() * 4)]
  return `${hex(rng, 8)}-${hex(rng, 4)}-4${hex(rng, 3)}-${variant}${hex(rng, 3)}-${hex(rng, 12)}`
}

const money = (x: number) => Math.round(x)
const money100 = (x: number) => Math.round(x / 100) * 100
const rate = (x: number) => Math.round(x * 100) / 100
const clampInt = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, Math.round(x)))

const PLACES = [
  { city: 'Trenton', zip: '08609' },
  { city: 'Trenton', zip: '08618' },
  { city: 'Hamilton', zip: '08610' },
  { city: 'Ewing', zip: '08638' },
  { city: 'Lawrenceville', zip: '08648' },
]
const STREETS = ['Chestnut', 'Hamilton', 'Greenwood', 'Prospect', 'Olden', 'Parkway', 'Bellevue', 'Stuyvesant']
const TYPES = ['single_family', 'single_family', 'single_family', 'townhouse', 'multi_family', 'condo']

export const AS_OF = '2026-04-01'
export const HORIZON_DAYS = 90
export const RESOLVED_AT = '2026-06-30'

export type GeneratedCorpus = {
  manifest: CorpusManifest
  properties: SimProperty[]
  analyses: AnalystOutput[]
  outcomes: Outcome[]
  policy: InvestmentPolicy
}

export function generateCorpus(args: { seed: number; count: number; policy?: InvestmentPolicy }): GeneratedCorpus {
  const { seed, count } = args
  const policy = args.policy ?? DEFAULT_POLICY
  const rng = mulberry32(seed)

  const properties: SimProperty[] = []
  const analyses: AnalystOutput[] = []
  const outcomes: Outcome[] = []

  for (let i = 0; i < count; i++) {
    const id = deterministicUuid(rng)
    const place = PLACES[Math.floor(rng() * PLACES.length)]
    const street = STREETS[Math.floor(rng() * STREETS.length)]
    const propertyType = TYPES[Math.floor(rng() * TYPES.length)]
    const listPrice = money100(120000 + rng() * 260000)

    // ── latent truth ──────────────────────────────────────────────
    const trueReno = money100(15000 + rng() * 70000)
    const trueArv = money100(listPrice * (1.12 + rng() * 0.45))
    const trueRent = money(listPrice * (0.006 + rng() * 0.005))

    // ── the simulated analyst's observation of that truth ─────────
    // PLANTED BIAS 1: renovation runs 10-40% light.
    const underestimate = 0.1 + rng() * 0.3
    const predReno = money100(trueReno * (1 - underestimate))
    // ARV: noisy but roughly unbiased (mean multiplier ~1.01).
    const predArv = money100(trueArv * (0.95 + rng() * 0.12))
    const predRent = money(trueRent * (0.93 + rng() * 0.14))

    const carrying = money100(listPrice * 0.04)
    const expenses = money(predRent * (0.35 + rng() * 0.1))
    const basis = listPrice + predReno + carrying
    const flipRoi = rate(((predArv - basis) / basis) * 100)
    const monthlyCashFlow = predRent - expenses
    const capRate = rate(((monthlyCashFlow * 12) / listPrice) * 100)

    const flipHead = flipRoi - policy.hurdle.flip_roi_min
    const rentalHead = capRate - policy.hurdle.rental_cap_rate_min
    const strategy: AnalystOutput['recommended_strategy'] =
      rng() < 0.12 ? 'either' : rentalHead > flipHead ? 'rental' : 'flip'

    // Confidence tracks headroom — then PLANTED BIAS 2 inflates the top of the range.
    // The base and slope are set so the corpus actually populates the upper buckets:
    // a calibration map fitted on confidences that all cluster near 50 would have no
    // evidence exactly where overconfidence lives, and the harness would find nothing.
    const head = Math.max(flipHead, rentalHead * 2)
    let confidence = 58 + head * 1.9 + (rng() - 0.5) * 10
    if (confidence > 68) confidence += 10
    const overall = clampInt(confidence, 32, 96)

    properties.push({
      id,
      address: `${100 + Math.floor(rng() * 900)} ${street} St`,
      city: place.city, state: 'NJ', zip: place.zip,
      property_type: propertyType,
      list_price: listPrice,
      raw_data: {
        score: clampInt(58 + flipRoi / 2 + rng() * 12, 35, 98),
        recommended_strategy: strategy,
        estimated_flip_roi: flipRoi,
        estimated_cap_rate: capRate,
        scouted_at: AS_OF,
        synthetic: true,
      },
    })

    analyses.push({
      property_id: id,
      flip: {
        arv: predArv, renovation_est: predReno, carrying_costs: carrying,
        total_investment: basis, profit_margin: predArv - basis, roi: flipRoi,
        timeline: `${4 + Math.floor(rng() * 6)} months`,
        confidence: clampInt(overall + (rng() - 0.5) * 10, 20, 99),
        explanation: 'Synthetic underwriting generated for backtest replay.',
      },
      rental: {
        monthly_rent: predRent, monthly_expenses: expenses, monthly_cash_flow: monthlyCashFlow,
        annual_noi: monthlyCashFlow * 12, cap_rate: capRate,
        cash_on_cash: rate(((monthlyCashFlow * 12) / (listPrice * 0.25)) * 100),
        confidence: clampInt(overall + (rng() - 0.5) * 10, 20, 99),
        explanation: 'Synthetic underwriting generated for backtest replay.',
      },
      recommended_strategy: strategy,
      overall_confidence: overall,
      summary: `Synthetic ${strategy} candidate in ${place.city}.`,
      data_sources_used: ['synthetic-generator'],
      data_gaps: ['no live comps — this record is synthetic'],
    })

    const statusDraw = rng()
    const terminal: Outcome['terminal_status'] =
      statusDraw < 0.6 ? 'sold' : statusDraw < 0.75 ? 'pending' : statusDraw < 0.9 ? 'off_market' : 'active'

    outcomes.push({
      property_id: id,
      terminal_status: terminal,
      resolved_at: RESOLVED_AT,
      actuals: { arv: trueArv, rental_income: trueRent, renovation_cost: trueReno },
    })
  }

  const manifest: CorpusManifest = {
    id: `synthetic-trenton-${seed}`,
    synthetic: true,
    generated_by: 'scripts/sim/generate-corpus.ts',
    seed,
    as_of: AS_OF,
    horizon_days: HORIZON_DAYS,
    description:
      'SYNTHETIC corpus. Latent truth drawn from a seeded PRNG, then observed by a simulated analyst with two deliberate biases. Not real listings; not evidence about the real Turnkey analyst.',
    counts: { properties: count },
    planted_biases: [
      'renovation_cost underestimated by 10-40%',
      'confidence inflated by +9 above a raw score of 72',
    ],
  }

  return { manifest, properties, analyses, outcomes, policy }
}
