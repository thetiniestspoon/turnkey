import { useState } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatPercent } from '@/lib/utils'
import { useToast } from '@/components/ui/toast'
import type { Property } from '@/hooks/use-properties'
import type { PipelineEntry } from '@/hooks/use-pipeline'

function scoreGradient(score: number | undefined): string {
  const s = score ?? 0
  if (s >= 70) return 'linear-gradient(135deg, #059669, #10b981)'
  if (s >= 50) return 'linear-gradient(135deg, #d97706, #fbbf24)'
  return 'linear-gradient(135deg, #dc2626, #f87171)'
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000

interface Props {
  property: Property
  pipelineEntry?: PipelineEntry | null
  onAddToPipeline: (id: string) => void
  onDeepAnalyze: (id: string) => void
  analyzing?: boolean
}

export function DealCardMini({ property: p, pipelineEntry, onAddToPipeline, onDeepAnalyze, analyzing }: Props) {
  const { toast } = useToast()
  const score = p.raw_data?.score
  const strategy = p.raw_data?.recommended_strategy
  const rationale = p.raw_data?.rationale
  const listingUrl = p.raw_data?.listing_url
  const imageUrl = p.raw_data?.image_url
  const analysis = p.property_analyses?.[0]
  const scoutedAt = p.raw_data?.scouted_at
  const [now] = useState(() => Date.now())
  const isNew = scoutedAt && (now - new Date(scoutedAt).getTime()) < ONE_DAY_MS
  const inPipeline = !!pipelineEntry

  async function handlePipeline() {
    if (inPipeline) {
      toast(`Already in pipeline (${pipelineEntry!.stage})`, 'info')
      return
    }
    onAddToPipeline(p.id)
    toast('Added to pipeline', 'success')
  }

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            {score && (
              <motion.div
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ type: 'spring', stiffness: 500, damping: 20 }}
              >
                <Badge variant="default" className="bg-green-600">★ {score}</Badge>
              </motion.div>
            )}
            {isNew && <Badge variant="default" className="bg-emerald-500">New</Badge>}
            {p.market_status && p.market_status !== 'active' && (
              <>
                {p.market_status === 'off_market' && (
                  <Badge variant="default" className="bg-red-600 text-white text-xs">Off Market</Badge>
                )}
                {p.market_status === 'pending' && (
                  <Badge variant="default" className="bg-yellow-500 text-white text-xs">Pending</Badge>
                )}
                {p.market_status === 'sold' && (
                  <Badge variant="secondary" className="text-xs">Sold</Badge>
                )}
                {p.market_status !== 'off_market' && p.market_status !== 'pending' && p.market_status !== 'sold' && (
                  <Badge variant="secondary" className="text-xs capitalize">{p.market_status}</Badge>
                )}
              </>
            )}
          </div>
          {strategy && <span className="text-xs text-muted-foreground capitalize">{strategy}</span>}
        </div>
        {imageUrl ? (
          <img
            src={imageUrl}
            alt={p.address}
            className="rounded h-24 w-full object-cover bg-muted"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        ) : (
          <div
            className="rounded h-24 flex items-center justify-center text-xs font-medium text-white px-2 text-center"
            style={{ background: scoreGradient(score) }}
          >
            {p.address}
          </div>
        )}
        <div className="flex items-center gap-2">
          <Link to={`/property/${p.id}`} className="flex-1 min-w-0">
            <p className="font-semibold text-sm hover:underline truncate">{p.address}, {p.city} {p.state}</p>
          </Link>
          {listingUrl && (
            <a href={listingUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-500 hover:underline shrink-0">
              Listing
            </a>
          )}
        </div>
        <p className="text-xs text-muted-foreground">
          {p.bedrooms}bd/{p.bathrooms}ba · {p.sqft} sqft
        </p>
        <p className="text-lg font-bold text-yellow-500">{formatCurrency(p.list_price || 0)}</p>
        {p.stale_at && (
          <p className="text-xs text-muted-foreground italic">Stale</p>
        )}
        {analysis && (
          <div className="flex gap-2">
            <Badge variant="outline" className="text-xs">Flip: {formatPercent(analysis.flip_roi || 0)} ROI</Badge>
            <Badge variant="outline" className="text-xs">Rent: {formatPercent(analysis.rental_cap_rate || 0)} cap</Badge>
          </div>
        )}
        {rationale && <p className="text-xs text-muted-foreground line-clamp-2">{rationale}</p>}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={handlePipeline}>
            {inPipeline ? `${pipelineEntry!.stage}` : '+ Pipeline'}
          </Button>
          <Button size="sm" className="flex-1" onClick={() => onDeepAnalyze(p.id)} disabled={analyzing}>
            {analyzing ? 'Analyzing...' : 'Deep Analyze'}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
