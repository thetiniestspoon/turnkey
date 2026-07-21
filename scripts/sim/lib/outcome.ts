import type { Observation, Outcome, Strategy } from '@/schemas/simulation'
import type { InvestmentPolicy } from './policy'
import { hurdleFor } from './decide'

// Resolution: what the deal actually returned, and whether that cleared its hurdle.
//
// Realized return is computed with the SAME formula as the underwriting, substituting
// the observed actuals. Using a different formula for the two halves would make the
// score a measure of the formula gap rather than of the model.
//
// STATED SIMPLIFICATION (see the design doc §2.2): the corpus observes ARV, rent and
// renovation cost. It does not observe carrying costs or operating expenses, so those
// are carried at their underwritten values. A model that is wrong about expenses is
// therefore invisible to this harness — that is a known blind spot, not an oversight.

export function realizedReturn(o: Observation, outcome: Outcome, strategy: Strategy): number {
  if (strategy === 'flip') {
    const basis = o.property.list_price + outcome.actuals.renovation_cost + o.analysis.flip.carrying_costs
    if (basis <= 0) return 0
    return ((outcome.actuals.arv - basis) / basis) * 100
  }
  const monthlyNet = outcome.actuals.rental_income - o.analysis.rental.monthly_expenses
  if (o.property.list_price <= 0) return 0
  return ((monthlyNet * 12) / o.property.list_price) * 100
}

// Exactly meeting the hurdle counts as cleared — the hurdle is a floor, not a gap.
//
// EPSILON is not cosmetic. A cap rate of ((2400-900)*12)/250000*100 evaluates to
// 7.1999999999999993, so a naive `>=` against a 7.2 hurdle flips a deal that exactly
// meets its threshold into a failure — and one flipped label moves the Brier score.
// The tolerance is far below any economically meaningful difference in a percentage
// return, so it cannot mask a real miss.
export const HURDLE_EPSILON = 1e-9

export function meetsHurdle(realized: number, hurdle: number): boolean {
  return realized >= hurdle - HURDLE_EPSILON
}

export function cleared(o: Observation, outcome: Outcome, strategy: Strategy, policy: InvestmentPolicy): boolean {
  return meetsHurdle(realizedReturn(o, outcome, strategy), hurdleFor(policy, strategy))
}

export type Resolution = {
  property_id: string
  strategy: Strategy
  realized_return: number
  hurdle: number
  shortfall: number
  cleared: boolean
  terminal_status: Outcome['terminal_status']
}

export function resolve(o: Observation, outcome: Outcome, strategy: Strategy, policy: InvestmentPolicy): Resolution {
  const realized = realizedReturn(o, outcome, strategy)
  const hurdle = hurdleFor(policy, strategy)
  return {
    property_id: o.property.id,
    strategy,
    realized_return: realized,
    hurdle,
    // Positive = missed the hurdle by this much. Negative = beat it by this much.
    shortfall: hurdle - realized,
    cleared: meetsHurdle(realized, hurdle),
    terminal_status: outcome.terminal_status,
  }
}
