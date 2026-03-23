import { z } from 'zod'

export const scoutPropertySchema = z.object({
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().length(2),
  zip: z.string().min(5),
  property_type: z.enum(['single_family', 'condo', 'multi_family', 'townhouse']),
  bedrooms: z.number().int().positive().optional(),
  bathrooms: z.number().positive().optional(),
  sqft: z.number().int().positive().optional(),
  year_built: z.number().int().optional(),
  list_price: z.number().positive(),
  score: z.number().int().min(0).max(100),
  rationale: z.string().min(1),
  recommended_strategy: z.enum(['flip', 'rental', 'either']),
  estimated_flip_roi: z.number().optional(),
  estimated_cap_rate: z.number().optional(),
})

export const scoutOutputSchema = z.object({
  properties: z.array(scoutPropertySchema),
  market_summary: z.string(),
  data_sources_used: z.array(z.string()),
})

export type ScoutOutput = z.infer<typeof scoutOutputSchema>
export type ScoutProperty = z.infer<typeof scoutPropertySchema>
