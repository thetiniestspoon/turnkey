import { useParams } from 'react-router-dom'
import { PageLayout } from '@/components/layout/page-layout'
import { DealCardFull } from '@/components/property/deal-card-full'
import { NeighborhoodPanel } from '@/components/property/neighborhood-panel'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useProperty } from '@/hooks/use-properties'
import { usePipeline } from '@/hooks/use-pipeline'
import { formatCurrency } from '@/lib/utils'

export default function DealCardPage() {
  const { id } = useParams<{ id: string }>()
  const { property, loading } = useProperty(id!)
  const { addToPipeline } = usePipeline()

  if (loading) return <PageLayout><p>Loading...</p></PageLayout>
  if (!property) return <PageLayout><p>Property not found.</p></PageLayout>

  const analysis = property.property_analyses?.[0]

  return (
    <PageLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <h1 className="text-2xl font-bold">{property.address}, {property.city} {property.state} {property.zip}</h1>
            <p className="text-muted-foreground">
              {property.bedrooms}bd/{property.bathrooms}ba · {property.sqft} sqft · Built {(property as unknown as { year_built?: number }).year_built} · {property.property_type}
            </p>
          </div>
          <div className="flex gap-2">
            {property.raw_data?.score && <Badge className="bg-green-600 text-lg">★ {property.raw_data.score}</Badge>}
            <Button onClick={() => addToPipeline(property.id)}>+ Add to Pipeline</Button>
          </div>
        </div>

        {property.list_price && (
          <p className="text-3xl font-bold text-yellow-500">{formatCurrency(property.list_price)}</p>
        )}

        {analysis ? (
          <>
            <DealCardFull analysis={analysis} />
            <NeighborhoodPanel data={analysis.neighborhood_data || {}} zip={property.zip} />
            <p className="text-xs text-muted-foreground">
              Analyzed {new Date(analysis.analyzed_at).toLocaleString()} · Model: {analysis.agent_model} · Confidence: {analysis.confidence_score}%
            </p>
          </>
        ) : (
          <p className="text-muted-foreground">No analysis yet. Click "Deep Analyze" from the Scout page.</p>
        )}
      </div>
    </PageLayout>
  )
}
