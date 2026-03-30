import { useRef, type MouseEvent } from 'react'
import { X, Eye } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { formatCurrency } from '@/lib/utils'
import type { Property } from '@/hooks/use-properties'

function TiltCard({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)

  function handleMove(e: MouseEvent<HTMLDivElement>) {
    const el = ref.current
    if (!el) return
    const rect = el.getBoundingClientRect()
    const x = (e.clientX - rect.left) / rect.width - 0.5
    const y = (e.clientY - rect.top) / rect.height - 0.5
    el.style.transform = `perspective(600px) rotateY(${x * 16}deg) rotateX(${-y * 16}deg) scale(1.02)`
  }

  function handleLeave() {
    const el = ref.current
    if (!el) return
    el.style.transform = 'perspective(600px) rotateY(0deg) rotateX(0deg) scale(1)'
  }

  return (
    <div
      ref={ref}
      onMouseMove={handleMove}
      onMouseLeave={handleLeave}
      style={{ transition: 'transform 0.2s ease-out', willChange: 'transform' }}
    >
      {children}
    </div>
  )
}

interface Props {
  recommended: Property[]
  onWatch: (propertyId: string) => void
  onDismiss: (propertyId: string) => void
  loading: boolean
}

function MarketStatusBadge({ status }: { status: string | null }) {
  if (!status || status === 'active') {
    return (
      <span className="flex items-center gap-1 text-xs text-green-600">
        <span className="inline-block w-2 h-2 rounded-full bg-green-500" />
        Active
      </span>
    )
  }
  if (status === 'pending') {
    return <Badge variant="default" className="bg-yellow-500 text-white text-xs">Pending</Badge>
  }
  if (status === 'off_market') {
    return <Badge variant="default" className="bg-red-600 text-white text-xs">Off Market</Badge>
  }
  if (status === 'sold') {
    return <Badge variant="secondary" className="text-xs">Sold</Badge>
  }
  return <Badge variant="secondary" className="text-xs capitalize">{status}</Badge>
}

export function RecommendedDeals({ recommended, onWatch, onDismiss, loading }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Ones to Watch</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground">Loading recommendations…</p>
        ) : recommended.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No new recommendations. Agents are scouting — check back soon.
          </p>
        ) : (
          <div className="flex gap-4 overflow-x-auto pb-2">
            {recommended.map((p) => {
              const score = p.raw_data?.score
              const strategy = p.raw_data?.recommended_strategy
              const imageUrl = p.raw_data?.image_url

              return (
                <TiltCard key={p.id}>
                <div
                  className="shrink-0 w-52 border rounded-lg p-3 space-y-2 bg-card"
                >
                  {/* Image */}
                  {imageUrl ? (
                    <img
                      src={imageUrl}
                      alt={p.address}
                      className="rounded h-24 w-full object-cover bg-muted"
                      onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
                    />
                  ) : (
                    <div className="bg-muted rounded h-24 flex items-center justify-center text-xs text-muted-foreground">
                      No photo
                    </div>
                  )}

                  {/* Score + strategy */}
                  <div className="flex items-center justify-between">
                    {score && (
                      <Badge variant="default" className="bg-green-600 text-xs">★ {score}</Badge>
                    )}
                    {strategy && (
                      <span className="text-xs text-muted-foreground capitalize">{strategy}</span>
                    )}
                  </div>

                  {/* Address */}
                  <Link to={`/property/${p.id}`}>
                    <p className="text-xs font-semibold hover:underline leading-tight truncate">
                      {p.address}, {p.city} {p.state}
                    </p>
                  </Link>

                  {/* Price */}
                  <p className="text-sm font-bold text-yellow-500">
                    {formatCurrency(p.list_price || 0)}
                  </p>

                  {/* Stale indicator */}
                  {p.stale_at && (
                    <p className="text-xs text-muted-foreground italic">Stale</p>
                  )}

                  {/* Market status */}
                  <MarketStatusBadge status={p.market_status} />

                  {/* Actions */}
                  <div className="flex gap-1.5 pt-1">
                    <Button
                      size="sm"
                      variant="default"
                      className="flex-1 text-xs h-7"
                      onClick={() => onWatch(p.id)}
                    >
                      <Eye className="w-3 h-3 mr-1" />
                      Watch
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-7 w-7 p-0 shrink-0"
                      onClick={() => onDismiss(p.id)}
                      title="Dismiss"
                    >
                      <X className="w-3 h-3" />
                    </Button>
                  </div>
                </div>
                </TiltCard>
              )
            })}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
