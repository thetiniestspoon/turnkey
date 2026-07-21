import { z } from 'zod'
import { analystOutputSchema } from './analyst-output'

// Zod contracts for the WS3 Phase-3 simulation layer.
//
// Additive only — no existing file under src/ is modified. These live beside the
// other schemas so the eventual /simulation page and the offline harness validate
// against one shared contract rather than two drifting copies.

// The slice of a `properties` row the decision loop actually observes. Field names
// and nesting match the row shape the scout persists (see scripts/agents/lib/db.ts
// PropertyRow), so a fixture is literally a recorded production row.
export const simPropertySchema = z.object({
  id: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
  zip: z.string().min(5),
  property_type: z.string().min(1),
  list_price: z.number().positive(),
  raw_data: z.object({
    score: z.number().int().min(0).max(100).nullable().optional(),
    recommended_strategy: z.string().nullable().optional(),
    estimated_flip_roi: z.number().nullable().optional(),
    estimated_cap_rate: z.number().nullable().optional(),
  }).passthrough(),
})
export type SimProperty = z.infer<typeof simPropertySchema>

// One unit of observation: a property plus the analyst's recorded underwriting of it.
export const observationSchema = z.object({
  property: simPropertySchema,
  analysis: analystOutputSchema,
})
export type Observation = z.infer<typeof observationSchema>

export const strategySchema = z.enum(['flip', 'rental'])
export type Strategy = z.infer<typeof strategySchema>

export const passReasonSchema = z.enum(['criteria', 'hurdle', 'confidence', 'admitted'])
export type PassReason = z.infer<typeof passReasonSchema>

export const decisionSchema = z.object({
  property_id: z.string().min(1),
  action: z.enum(['buy', 'pass']),
  strategy: strategySchema,
  reason: passReasonSchema,
  underwritten_return: z.number(),
  hurdle: z.number(),
  confidence_raw: z.number().min(0).max(100),
  p: z.number().min(0).max(1),
  capital_committed: z.number().nonnegative(),
  notes: z.string(),
})
export type Decision = z.infer<typeof decisionSchema>

// What actually happened, at the corpus horizon.
export const outcomeSchema = z.object({
  property_id: z.string().min(1),
  terminal_status: z.enum(['active', 'off_market', 'pending', 'sold', 'unknown']),
  resolved_at: z.string().min(1),
  actuals: z.object({
    arv: z.number().positive(),
    rental_income: z.number().positive(),
    renovation_cost: z.number().nonnegative(),
  }),
})
export type Outcome = z.infer<typeof outcomeSchema>

export const calibrationBucketSchema = z.object({
  lo: z.number().min(0).max(1),
  hi: z.number().min(0).max(1),
  n: z.number().int().nonnegative(),
  mean_p: z.number().min(0).max(1),
  // The RAW empirical clear rate in this bucket. This is the truth about what
  // happened, and it is what the report must quote when it says "actually cleared".
  observed: z.number().min(0).max(1).nullable(),
  // The Laplace-smoothed estimate that applyCalibration substitutes for p. It is a
  // deliberately conservative ESTIMATE, not an observation — kept in a separate field
  // so the two can never be confused in prose again.
  adjusted: z.number().min(0).max(1).nullable(),
})
export type CalibrationBucket = z.infer<typeof calibrationBucketSchema>

export const calibrationMapSchema = z.object({
  version: z.number().int().positive(),
  fitted_from: z.string(),
  buckets: z.array(calibrationBucketSchema),
})
export type CalibrationMap = z.infer<typeof calibrationMapSchema>

export const corpusManifestSchema = z.object({
  id: z.string().min(1),
  synthetic: z.boolean(),
  generated_by: z.string().min(1),
  seed: z.number().int(),
  as_of: z.string().min(1),
  horizon_days: z.number().int().positive(),
  description: z.string(),
  counts: z.object({ properties: z.number().int().nonnegative() }),
  planted_biases: z.array(z.string()),
})
export type CorpusManifest = z.infer<typeof corpusManifestSchema>
