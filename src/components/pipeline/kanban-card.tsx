import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import { STAGE_COLORS } from '@/data/pipeline-stages'
import type { PipelineEntry } from '@/hooks/use-pipeline'

export function KanbanCard({ entry }: { entry: PipelineEntry }) {
  const p = entry.properties
  const score = p?.raw_data?.score
  const strategy = p?.raw_data?.recommended_strategy
  const isStale = !!p?.stale_at

  return (
    <motion.div
      layout
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 400, damping: 25 }}
    >
      <Link
        to={`/property/${entry.property_id}`}
        draggable
        onDragStart={(e) => {
          e.dataTransfer.setData('pipelineId', entry.id)
          e.dataTransfer.setData('currentStage', entry.stage)
        }}
        className={`block bg-card rounded-md p-3 border-l-[3px] hover:bg-accent transition-colors cursor-grab active:cursor-grabbing ${
          isStale ? 'opacity-60 grayscale animate-pulse-border' : ''
        }`}
        style={{
          borderLeftColor: isStale ? undefined : STAGE_COLORS[entry.stage],
          ...(isStale ? { borderLeftColor: '#f59e0b', borderLeftWidth: '4px' } : {}),
        }}
      >
        <div className="flex items-center gap-1">
          <p className="text-sm font-medium flex-1 truncate">{p?.address || 'Unknown'}</p>
          {isStale && (
            <Badge variant="outline" className="text-[10px] border-amber-500 text-amber-500 shrink-0">
              Stale
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{p?.city} {p?.state} · {formatCurrency(p?.list_price || 0)}</p>
        <div className="flex gap-1 mt-1">
          {score && <Badge variant="secondary" className="text-xs">&#9733; {score}</Badge>}
          {strategy && <Badge variant="outline" className="text-xs capitalize">{strategy}</Badge>}
        </div>
      </Link>
    </motion.div>
  )
}
