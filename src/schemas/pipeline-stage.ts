import { z } from 'zod'
import { PIPELINE_STAGES, isValidTransition } from '@/data/pipeline-stages'

export const pipelineStageSchema = z.enum(PIPELINE_STAGES)

export const stageTransitionSchema = z.object({
  from: pipelineStageSchema,
  to: pipelineStageSchema,
}).refine(
  ({ from, to }) => isValidTransition(from, to),
  { message: 'Invalid stage transition: cannot move backward' }
)
