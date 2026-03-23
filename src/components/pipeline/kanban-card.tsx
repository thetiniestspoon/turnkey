import { Link } from 'react-router-dom'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { STAGE_COLORS } from '@/data/pipeline-stages'
import type { PipelineEntry } from '@/hooks/use-pipeline'

export function KanbanCard({ entry }: { entry: PipelineEntry }) {
  const p = entry.properties
  const score = p?.raw_data?.score
  const strategy = p?.raw_data?.recommended_strategy

  return (
    <Link
      to={`/property/${entry.property_id}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData('pipelineId', entry.id)
        e.dataTransfer.setData('currentStage', entry.stage)
      }}
      className="block bg-card rounded-md p-3 border-l-[3px] hover:bg-accent transition-colors cursor-grab active:cursor-grabbing"
      style={{ borderLeftColor: STAGE_COLORS[entry.stage] }}
    >
      <p className="text-sm font-medium">{p?.address || 'Unknown'}</p>
      <p className="text-xs text-muted-foreground">{p?.city} {p?.state} · {formatCurrency(p?.list_price || 0)}</p>
      <div className="flex gap-1 mt-1">
        {score && <Badge variant="secondary" className="text-xs">★ {score}</Badge>}
        {strategy && <Badge variant="outline" className="text-xs capitalize">{strategy}</Badge>}
      </div>
    </Link>
  )
}
