import { STAGE_LABELS, STAGE_COLORS } from '@/data/pipeline-stages'
import type { PipelineStage } from '@/data/pipeline-stages'
import { KanbanCard } from './kanban-card'
import type { PipelineEntry } from '@/hooks/use-pipeline'

interface Props {
  stage: PipelineStage
  entries: PipelineEntry[]
  onDrop: (pipelineId: string, fromStage: PipelineStage, toStage: PipelineStage) => void
}

export function KanbanColumn({ stage, entries, onDrop }: Props) {
  return (
    <div
      className="flex-1 min-w-[180px]"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        const pipelineId = e.dataTransfer.getData('pipelineId')
        const fromStage = e.dataTransfer.getData('currentStage') as PipelineStage
        if (pipelineId && fromStage !== stage) {
          onDrop(pipelineId, fromStage, stage)
        }
      }}
    >
      <div className="text-center mb-3">
        <span className="text-xs font-bold" style={{ color: STAGE_COLORS[stage] }}>
          {STAGE_LABELS[stage]} ({entries.length})
        </span>
      </div>
      <div className="space-y-2">
        {entries.map((entry) => (
          <KanbanCard key={entry.id} entry={entry} />
        ))}
      </div>
    </div>
  )
}
