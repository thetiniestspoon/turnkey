import { z } from 'zod'

export const analystOutputSchema = z.object({
  property_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid UUID'),
  flip: z.object({
    arv: z.number().positive(),
    renovation_est: z.number().nonnegative(),
    carrying_costs: z.number().nonnegative(),
    total_investment: z.number().positive(),
    profit_margin: z.number(),
    roi: z.number(),
    timeline: z.string(),
    confidence: z.number().int().min(0).max(100),
    explanation: z.string(),
  }),
  rental: z.object({
    monthly_rent: z.number().positive(),
    monthly_expenses: z.number().nonnegative(),
    monthly_cash_flow: z.number(),
    annual_noi: z.number(),
    cap_rate: z.number(),
    cash_on_cash: z.number(),
    confidence: z.number().int().min(0).max(100),
    explanation: z.string(),
  }),
  recommended_strategy: z.enum(['flip', 'rental', 'either']),
  overall_confidence: z.number().int().min(0).max(100),
  summary: z.string(),
  data_sources_used: z.array(z.string()),
  data_gaps: z.array(z.string()),
})

export type AnalystOutput = z.infer<typeof analystOutputSchema>
