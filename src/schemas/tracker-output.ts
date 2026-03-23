import { z } from 'zod'

export const predictionComparisonSchema = z.object({
  metric: z.string(),
  predicted: z.number(),
  actual: z.number(),
  accuracy_pct: z.number(),
  assessment: z.string(),
})

export const trackerOutputSchema = z.object({
  property_id: z.string().regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, 'Invalid UUID'),
  comparisons: z.array(predictionComparisonSchema),
  overall_accuracy: z.number().min(0).max(100),
  summary: z.string(),
  recommendations: z.array(z.string()),
})

export type TrackerOutput = z.infer<typeof trackerOutputSchema>
