import { useEffect, useRef } from 'react'
import confetti from 'canvas-confetti'
import { PIPELINE_STAGES } from '@/data/pipeline-stages'
import type { PipelineStage } from '@/data/pipeline-stages'
import { KanbanColumn } from './kanban-column'
import type { PipelineEntry } from '@/hooks/use-pipeline'

interface Props {
  entries: PipelineEntry[]
  onMoveStage: (pipelineId: string, from: PipelineStage, to: PipelineStage) => void
}

export function KanbanBoard({ entries, onMoveStage }: Props) {
  const prevClosedIds = useRef<Set<string>>(new Set())

  const grouped = PIPELINE_STAGES.reduce((acc, stage) => {
    acc[stage] = entries.filter((e) => e.stage === stage)
    return acc
  }, {} as Record<PipelineStage, PipelineEntry[]>)

  // Fire confetti when a new property appears in the closed stage
  useEffect(() => {
    const closedIds = new Set(grouped.closed.map((e) => e.id))
    // On first render, just capture the IDs without firing
    if (prevClosedIds.current.size === 0 && closedIds.size > 0) {
      prevClosedIds.current = closedIds
      return
    }
    // Check for newly closed entries
    let hasNew = false
    closedIds.forEach((id) => {
      if (!prevClosedIds.current.has(id)) hasNew = true
    })
    if (hasNew) {
      confetti({
        particleCount: 120,
        spread: 70,
        origin: { y: 0.6 },
        colors: ['#00b894', '#ffeaa7', '#fdcb6e', '#74b9ff', '#a29bfe'],
      })
    }
    prevClosedIds.current = closedIds
  }, [grouped.closed])

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {PIPELINE_STAGES.map((stage) => (
        <KanbanColumn
          key={stage}
          stage={stage}
          entries={grouped[stage]}
          totalEntries={entries.length}
          onDrop={onMoveStage}
        />
      ))}
    </div>
  )
}
