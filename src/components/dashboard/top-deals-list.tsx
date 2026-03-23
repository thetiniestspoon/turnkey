import { Link } from 'react-router-dom'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency } from '@/lib/utils'
import type { Property } from '@/hooks/use-properties'

export function TopDealsList({ properties }: { properties: Property[] }) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">🔍 Top Deals from Last Scout</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        {properties.length === 0 && (
          <p className="text-sm text-muted-foreground">No scout results yet. Run a scout to find deals.</p>
        )}
        {properties.map((p) => (
          <Link key={p.id} to={`/property/${p.id}`} className="flex justify-between items-center hover:bg-accent rounded p-2 -mx-2">
            <div>
              <p className="text-sm font-medium">{p.address}, {p.city} {p.state}</p>
              <p className="text-xs text-muted-foreground">
                {p.bedrooms}bd/{p.bathrooms}ba · {formatCurrency(p.list_price || 0)}
              </p>
            </div>
            {p.raw_data?.score && (
              <Badge variant="secondary">★ {p.raw_data.score}</Badge>
            )}
          </Link>
        ))}
      </CardContent>
    </Card>
  )
}
