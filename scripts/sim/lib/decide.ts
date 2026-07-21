import type { Decision, Observation, Strategy, CalibrationMap } from '@/schemas/simulation'
import type { InvestmentPolicy } from './policy'
import { applyCalibration } from './calibrate'
import { passesFilter, type CriteriaFields } from '../../agents/lib/orchestrate'

// THE MODEL UNDER TEST.
//
// Pure: (observation, policy, calibration) -> Decision. No clock, no randomness, no
// I/O. That is what makes every decision reproducible from (fixture, seed) alone.

function headroom(value: number, hurdle: number): number {
  return value - hurdle
}

// On 'either' the analyst has declined to choose, so the policy chooses: whichever
// strategy stands furthest above its OWN hurdle. Comparing raw ROI to raw cap rate
// would be meaningless — they are different units — but comparing each one's
// distance above its own threshold is not. Exact ties go to flip, deterministically.
function chooseStrategy(o: Observation, policy: InvestmentPolicy): Strategy {
  const recommended = o.analysis.recommended_strategy
  if (recommended === 'flip' || recommended === 'rental') return recommended
  const flipHead = headroom(o.analysis.flip.roi, policy.hurdle.flip_roi_min)
  const rentalHead = headroom(o.analysis.rental.cap_rate, policy.hurdle.rental_cap_rate_min)
  return rentalHead > flipHead ? 'rental' : 'flip'
}

export function underwrittenReturn(o: Observation, strategy: Strategy): number {
  return strategy === 'flip' ? o.analysis.flip.roi : o.analysis.rental.cap_rate
}

export function hurdleFor(policy: InvestmentPolicy, strategy: Strategy): number {
  return strategy === 'flip' ? policy.hurdle.flip_roi_min : policy.hurdle.rental_cap_rate_min
}

export function decide(o: Observation, policy: InvestmentPolicy, calibration: CalibrationMap): Decision {
  const strategy = chooseStrategy(o, policy)
  const value = underwrittenReturn(o, strategy)
  const hurdle = hurdleFor(policy, strategy)
  const confidenceRaw = o.analysis.overall_confidence
  const p = applyCalibration(confidenceRaw / 100, calibration)

  const base = {
    property_id: o.property.id,
    strategy,
    underwritten_return: value,
    hurdle,
    confidence_raw: confidenceRaw,
    p,
  }
  const pass = (reason: 'criteria' | 'hurdle' | 'confidence', notes: string): Decision => ({
    ...base, action: 'pass' as const, reason, capital_committed: 0, notes,
  })

  // Gate 1 — criteria. Reuses the function ported verbatim from agent-autoscout, so
  // the simulator rejects exactly what production rejects. If these two ever drift,
  // the backtest is grading a model nobody runs.
  if (!passesFilter(o.property as Parameters<typeof passesFilter>[0], policy.criteria as CriteriaFields)) {
    return pass('criteria', 'failed the policy criteria filter (price / score / type / strategy)')
  }

  // Gate 2 — hurdle.
  if (value < hurdle) {
    return pass('hurdle', `underwritten ${strategy} return ${value} is below the ${hurdle} hurdle`)
  }

  // Gate 3 — confidence, on the CALIBRATED probability.
  if (p * 100 < policy.confidence_floor) {
    return pass('confidence', `calibrated confidence ${(p * 100).toFixed(1)} is below the ${policy.confidence_floor} floor`)
  }

  return {
    ...base,
    action: 'buy',
    reason: 'admitted',
    capital_committed: policy.capital_per_deal,
    notes: `${strategy} at ${value} vs hurdle ${hurdle}, calibrated confidence ${(p * 100).toFixed(1)}`,
  }
}
