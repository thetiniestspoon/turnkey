export const PIPELINE_STAGES = [
  'watching', 'analyzing', 'offer', 'negotiating', 'acquired', 'tracking', 'closed',
] as const

export type PipelineStage = typeof PIPELINE_STAGES[number]

export const STAGE_COLORS: Record<PipelineStage, string> = {
  watching: '#888888',
  analyzing: '#a29bfe',
  offer: '#ffeaa7',
  negotiating: '#fdcb6e',
  acquired: '#00b894',
  tracking: '#74b9ff',
  closed: '#636e72',
}

export const STAGE_LABELS: Record<PipelineStage, string> = {
  watching: '👀 Watching',
  analyzing: '🔬 Analyzing',
  offer: '📝 Offer',
  negotiating: '🤝 Negotiating',
  acquired: '✅ Acquired',
  tracking: '📈 Tracking',
  closed: '🏁 Closed',
}

export function isValidTransition(from: PipelineStage, to: PipelineStage): boolean {
  const fromIdx = PIPELINE_STAGES.indexOf(from)
  const toIdx = PIPELINE_STAGES.indexOf(to)
  return toIdx > fromIdx
}
