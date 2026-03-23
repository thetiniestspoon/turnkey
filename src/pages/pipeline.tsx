import { PageLayout } from '@/components/layout/page-layout'
import { KanbanBoard } from '@/components/pipeline/kanban-board'
import { usePipeline } from '@/hooks/use-pipeline'
import type { PipelineStage } from '@/data/pipeline-stages'

export default function PipelinePage() {
  const { entries, loading, moveStage } = usePipeline()

  async function handleMoveStage(pipelineId: string, from: PipelineStage, to: PipelineStage) {
    const error = await moveStage(pipelineId, from, to)
    if (error) alert(`Cannot move: ${error.message || error}`)
  }

  return (
    <PageLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Pipeline</h1>
        {loading ? (
          <p className="text-muted-foreground">Loading...</p>
        ) : entries.length === 0 ? (
          <p className="text-muted-foreground">No deals in pipeline yet. Add properties from the Scout page.</p>
        ) : (
          <KanbanBoard entries={entries} onMoveStage={handleMoveStage} />
        )}
      </div>
    </PageLayout>
  )
}
