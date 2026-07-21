import { z } from 'zod'

// An investment policy is the thing being backtested *alongside* the model: change
// the hurdle or the confidence floor and the same corpus yields a different set of
// decisions. Keeping it a first-class, serialisable object (rather than constants
// in the decision function) is what makes "what would a stricter policy have done?"
// answerable without touching code.

export const investmentPolicySchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  // Used only to total notional capital in the report. There is deliberately NO
  // max_concurrent_positions here: enforcing a position cap would require modelling
  // holding periods and timing, which is the portfolio simulation this design
  // rejected. An unenforced policy field is worse than an absent one — it reads like
  // a constraint while constraining nothing.
  capital_per_deal: z.number().positive(),
  hurdle: z.object({
    flip_roi_min: z.number(),
    rental_cap_rate_min: z.number(),
  }),
  // Applied to the CALIBRATED probability × 100, not the raw analyst confidence.
  confidence_floor: z.number().min(0).max(100),
  // Same field names as investment_criteria / watchlists.criteria_overrides so the
  // simulator can be pointed at a real user's criteria row unchanged.
  criteria: z.object({
    max_price: z.number().positive().nullable().optional(),
    min_cap_rate: z.number().nullable().optional(),
    min_flip_roi: z.number().nullable().optional(),
    min_score: z.number().nullable().optional(),
    property_types: z.array(z.string()).nullable().optional(),
    strategies: z.array(z.string()).nullable().optional(),
  }),
})

export type InvestmentPolicy = z.infer<typeof investmentPolicySchema>

// The house baseline. Numbers are the ones Turnkey's UI already treats as ordinary:
// a 15% flip ROI and a 6.5% cap rate are the thresholds the dashboard colours green,
// and 60 is the default auto_analyze_min_score from agent-orchestrator.
export const DEFAULT_POLICY: InvestmentPolicy = {
  id: 'baseline-v1',
  name: 'Baseline — Trenton starter',
  capital_per_deal: 60000,
  hurdle: { flip_roi_min: 15, rental_cap_rate_min: 6.5 },
  confidence_floor: 55,
  criteria: {
    max_price: 400000,
    min_score: 60,
    property_types: null,
    strategies: null,
    min_cap_rate: null,
    min_flip_roi: null,
  },
}
