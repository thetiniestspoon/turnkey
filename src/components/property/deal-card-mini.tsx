import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency, formatPercent } from '@/lib/utils'
import type { Property } from '@/hooks/use-properties'

const ONE_DAY_MS = 24 * 60 * 60 * 1000

interface Props {
  property: Property
  onAddToPipeline: (id: string) => void
  onDeepAnalyze: (id: string) => void
}

export function DealCardMini({ property: p, onAddToPipeline, onDeepAnalyze }: Props) {
  const score = p.raw_data?.score
  const strategy = p.raw_data?.recommended_strategy
  const rationale = p.raw_data?.rationale
  const analysis = p.property_analyses?.[0]
  const scoutedAt = p.raw_data?.scouted_at
  const [now] = useState(() => Date.now())
  const isNew = scoutedAt && (now - new Date(scoutedAt).getTime()) < ONE_DAY_MS

  return (
    <Card>
      <CardContent className="pt-4 space-y-3">
        <div className="flex justify-between items-center">
          <div className="flex items-center gap-1.5">
            {score && <Badge variant="default" className="bg-green-600">★ {score}</Badge>}
            {isNew && <Badge variant="default" className="bg-emerald-500">New</Badge>}
          </div>
          {strategy && <span className="text-xs text-muted-foreground capitalize">{strategy}</span>}
        </div>
        <div className="bg-muted rounded h-24 flex items-center justify-center text-xs text-muted-foreground">
          Street View
        </div>
        <Link to={`/property/${p.id}`}>
          <p className="font-semibold text-sm hover:underline">{p.address}, {p.city} {p.state}</p>
        </Link>
        <p className="text-xs text-muted-foreground">
          {p.bedrooms}bd/{p.bathrooms}ba · {p.sqft} sqft
        </p>
        <p className="text-lg font-bold text-yellow-500">{formatCurrency(p.list_price || 0)}</p>
        {analysis && (
          <div className="flex gap-2">
            <Badge variant="outline" className="text-xs">Flip: {formatPercent(analysis.flip_roi || 0)} ROI</Badge>
            <Badge variant="outline" className="text-xs">Rent: {formatPercent(analysis.rental_cap_rate || 0)} cap</Badge>
          </div>
        )}
        {rationale && <p className="text-xs text-muted-foreground line-clamp-2">{rationale}</p>}
        <div className="flex gap-2">
          <Button size="sm" variant="outline" className="flex-1" onClick={() => onAddToPipeline(p.id)}>+ Pipeline</Button>
          <Button size="sm" className="flex-1" onClick={() => onDeepAnalyze(p.id)}>Deep Analyze</Button>
        </div>
      </CardContent>
    </Card>
  )
}
