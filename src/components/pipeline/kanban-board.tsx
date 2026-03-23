import { PIPELINE_STAGES, PipelineStage } from '@/data/pipeline-stages'
import { KanbanColumn } from './kanban-column'
import type { PipelineEntry } from '@/hooks/use-pipeline'

interface Props {
  entries: PipelineEntry[]
  onMoveStage: (pipelineId: string, from: PipelineStage, to: PipelineStage) => void
}

export function KanbanBoard({ entries, onMoveStage }: Props) {
  const grouped = PIPELINE_STAGES.reduce((acc, stage) => {
    acc[stage] = entries.filter((e) => e.stage === stage)
    return acc
  }, {} as Record<PipelineStage, PipelineEntry[]>)

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {PIPELINE_STAGES.map((stage) => (
        <KanbanColumn
          key={stage}
          stage={stage}
          entries={grouped[stage]}
          onDrop={onMoveStage}
        />
      ))}
    </div>
  )
}
