import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { PageLayout } from '@/components/layout/page-layout'
import { DealCardFull } from '@/components/property/deal-card-full'
import { NeighborhoodPanel } from '@/components/property/neighborhood-panel'
import { WalkabilityGauge } from '@/components/property/walkability-gauge'
import { AgentTimeline } from '@/components/property/agent-timeline'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { useProperty } from '@/hooks/use-properties'
import { usePipeline } from '@/hooks/use-pipeline'
import { useAgent } from '@/hooks/use-agent'
import { useToast } from '@/components/ui/toast'
import { formatCurrency } from '@/lib/utils'

/* ── Risk badge helper ─────────────────────────────────────── */
interface RiskBadge {
  label: string
  severity: 'green' | 'yellow' | 'red'
}

const SEVERITY_CLASSES: Record<string, string> = {
  green: 'bg-green-600/20 text-green-400 border-green-600/40',
  yellow: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/40',
  red: 'bg-red-600/20 text-red-400 border-red-600/40',
}

function buildRiskBadges(property: Record<string, unknown>): RiskBadge[] {
  const badges: RiskBadge[] = []
  const raw = (property.raw_data || {}) as Record<string, unknown>

  // Flood zone
  const flood = raw.flood_zone as string | undefined
  if (flood) {
    const isHigh = /^(A|V|AE|VE)/i.test(flood)
    const isMod = /^(B|X500)/i.test(flood)
    badges.push({
      label: `Flood: ${flood}`,
      severity: isHigh ? 'red' : isMod ? 'yellow' : 'green',
    })
  }

  // Market status
  const status = property.market_status as string | undefined
  if (status) {
    const sev = status === 'active' ? 'green'
      : status === 'pending' ? 'yellow'
      : status === 'off_market' || status === 'sold' ? 'red'
      : 'yellow'
    badges.push({ label: `Market: ${status.replace('_', ' ')}`, severity: sev })
  }

  // Walk score
  const walkScore = (raw.walk_score as number) ?? (raw.walkability as Record<string, unknown>)?.walk_score as number | undefined
  if (walkScore != null) {
    badges.push({
      label: `Walk: ${walkScore}`,
      severity: walkScore >= 70 ? 'green' : walkScore >= 40 ? 'yellow' : 'red',
    })
  }

  return badges
}

/* ── Listing domain extractor ──────────────────────────────── */
function extractDomain(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return 'Listing'
  }
}

/* ── Page ───────────────────────────────────────────────────── */
export default function DealCardPage() {
  const { id } = useParams<{ id: string }>()
  const { property, loading } = useProperty(id!)
  const { addToPipeline, getPipelineEntry } = usePipeline()
  const { invokeAgent, loading: agentLoading } = useAgent()
  const { toast } = useToast()
  const [analyzing, setAnalyzing] = useState(false)

  if (loading) return <PageLayout><p>Loading...</p></PageLayout>
  if (!property) return <PageLayout><p>Property not found.</p></PageLayout>

  const analysis = property.property_analyses?.[0]
  const pipelineEntry = getPipelineEntry(property.id)
  const imageUrl = property.raw_data?.image_url
  const listingUrl = property.raw_data?.listing_url
  const riskBadges = buildRiskBadges(property as unknown as Record<string, unknown>)

  // Walkability data (may live in raw_data directly or under a walkability key)
  const walkData = property.raw_data?.walkability || {
    walk_score: property.raw_data?.walk_score,
    transit_score: property.raw_data?.transit_score,
    bike_score: property.raw_data?.bike_score,
  }
  const hasWalkData = walkData.walk_score != null

  async function handlePipeline() {
    if (pipelineEntry) {
      toast(`Already in pipeline (${pipelineEntry.stage})`, 'info')
      return
    }
    const error = await addToPipeline(property!.id)
    if (error) {
      toast(error.message || 'Failed to add', 'error')
    } else {
      toast('Added to pipeline', 'success')
    }
  }

  async function handleDeepAnalyze() {
    setAnalyzing(true)
    const result = await invokeAgent('analyst', { property_id: property!.id })
    setAnalyzing(false)
    if (result) {
      toast('Analysis complete', 'success')
      window.location.reload()
    } else {
      toast('Analysis failed — check Edge Function deployment', 'error')
    }
  }

  return (
    <PageLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-start">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold">{property.address}, {property.city} {property.state} {property.zip}</h1>
            </div>
            <p className="text-muted-foreground">
              {property.bedrooms}bd/{property.bathrooms}ba · {property.sqft} sqft · Built {(property as unknown as { year_built?: number }).year_built} · {property.property_type}
            </p>
          </div>
          <div className="flex gap-2">
            {property.raw_data?.score && <Badge className="bg-green-600 text-lg">&#9733; {property.raw_data.score}</Badge>}
            <Button variant="outline" onClick={handleDeepAnalyze} disabled={analyzing || agentLoading}>
              {analyzing ? 'Analyzing...' : 'Deep Analyze'}
            </Button>
            <Button onClick={handlePipeline}>
              {pipelineEntry ? `In Pipeline (${pipelineEntry.stage})` : '+ Add to Pipeline'}
            </Button>
          </div>
        </div>

        {/* Listing preview card (#23) */}
        {listingUrl && (
          <a
            href={listingUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card hover:bg-accent transition-colors group w-fit"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground group-hover:text-foreground transition-colors">
              <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
            <div>
              <p className="text-sm font-medium group-hover:underline">View on {extractDomain(listingUrl)}</p>
              <p className="text-xs text-muted-foreground truncate max-w-xs">{listingUrl}</p>
            </div>
          </a>
        )}

        {/* Risk badges row (#24) */}
        {riskBadges.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {riskBadges.map((badge) => (
              <span
                key={badge.label}
                className={`text-xs font-medium px-2.5 py-1 rounded-full border ${SEVERITY_CLASSES[badge.severity]}`}
              >
                {badge.label}
              </span>
            ))}
          </div>
        )}

        {imageUrl && (
          <img
            src={imageUrl}
            alt={property.address}
            className="rounded-lg w-full max-h-64 object-cover bg-muted"
            onError={(e) => { (e.target as HTMLImageElement).style.display = 'none' }}
          />
        )}

        {property.list_price && (
          <p className="text-3xl font-bold text-yellow-500">{formatCurrency(property.list_price)}</p>
        )}

        {analysis ? (
          <>
            <DealCardFull analysis={analysis} />

            {/* Walkability + Neighborhood side by side */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {hasWalkData && (
                <div className="md:col-span-1 flex justify-center">
                  <WalkabilityGauge data={walkData} />
                </div>
              )}
              <div className={hasWalkData ? 'md:col-span-2' : 'md:col-span-3'}>
                <NeighborhoodPanel data={analysis.neighborhood_data || {}} zip={property.zip} />
              </div>
            </div>

            {/* Agent Timeline (#25) */}
            <AgentTimeline propertyId={property.id} />

            <p className="text-xs text-muted-foreground">
              Analyzed {new Date(analysis.analyzed_at).toLocaleString()} · Model: {analysis.agent_model} · Confidence: {analysis.confidence_score}%
            </p>
          </>
        ) : (
          <div className="text-center py-12">
            <p className="text-muted-foreground mb-4">No analysis yet.</p>
            <Button onClick={handleDeepAnalyze} disabled={analyzing || agentLoading}>
              {analyzing ? 'Running Deep Analysis...' : 'Run Deep Analysis'}
            </Button>
          </div>
        )}
      </div>
    </PageLayout>
  )
}
