import { useState } from 'react'
import { PageLayout } from '@/components/layout/page-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DealCardMini } from '@/components/property/deal-card-mini'
import { useProperties } from '@/hooks/use-properties'
import { usePipeline } from '@/hooks/use-pipeline'
import { useAgent } from '@/hooks/use-agent'
import { useToast } from '@/components/ui/toast'
import { supabase } from '@/lib/supabase'
import type { Property } from '@/hooks/use-properties'

interface ScoutResult {
  properties?: Array<{
    address: string
    city: string
    state: string
    zip: string
    property_type?: string
    bedrooms?: number
    bathrooms?: number
    sqft?: number
    year_built?: number
    list_price?: number
    score?: number
    rationale?: string
    recommended_strategy?: string
    estimated_flip_roi?: number
    estimated_cap_rate?: number
    listing_url?: string
    image_url?: string
  }>
}

function ScoutedTerritories() {
  // Hardcoded for now — would query watchlists
  const territories = [
    { zip: '07040', name: 'Maplewood', deals: 12 },
    { zip: '07079', name: 'S. Orange', deals: 0 },
    { zip: '07042', name: 'Montclair', deals: 4 },
    { zip: '12508', name: 'Beacon', deals: 6 },
    { zip: '28712', name: 'Brevard', deals: 7 },
  ]
  return (
    <div className="flex gap-2 overflow-x-auto pb-2">
      {territories.map(t => (
        <button key={t.zip} onClick={() => {/* could set market */}}
          className="flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-medium border bg-card hover:bg-accent transition-colors">
          {t.name} <span className="text-muted-foreground ml-1">{t.deals > 0 ? `${t.deals} deals` : 'new'}</span>
        </button>
      ))}
    </div>
  )
}

export default function ScoutPage() {
  const [market, setMarket] = useState('')
  const [scoutResults, setScoutResults] = useState<Property[]>([])
  const [analyzingId, setAnalyzingId] = useState<string | null>(null)
  const { properties: savedProperties } = useProperties({ source: 'agent_scout' })
  const { addToPipeline, getPipelineEntry } = usePipeline()
  const { invokeAgent, loading, error } = useAgent()
  const { toast } = useToast()

  async function handleScout() {
    if (!market.trim()) return
    const result = await invokeAgent<ScoutResult>('scout', { market: market.trim(), filters: {} })
    if (!result?.properties) return

    // Save properties to DB from the frontend (authenticated user)
    const saved: Property[] = []
    for (const prop of result.properties) {
      const { data } = await supabase.from('properties').upsert({
        address: prop.address,
        city: prop.city,
        state: prop.state,
        zip: prop.zip,
        property_type: prop.property_type,
        bedrooms: prop.bedrooms,
        bathrooms: prop.bathrooms,
        sqft: prop.sqft,
        year_built: prop.year_built,
        list_price: prop.list_price,
        estimated_value: prop.list_price,
        source: 'agent_scout',
        raw_data: {
          score: prop.score,
          rationale: prop.rationale,
          recommended_strategy: prop.recommended_strategy,
          estimated_flip_roi: prop.estimated_flip_roi,
          estimated_cap_rate: prop.estimated_cap_rate,
          listing_url: prop.listing_url || null,
          image_url: prop.image_url || null,
          scouted_at: new Date().toISOString(),
        },
      }, { onConflict: 'address,city,state' }).select().single()

      if (data) saved.push(data as Property)
    }

    setScoutResults(saved)
    toast(`Found ${saved.length} properties`, 'success')
  }

  async function handleDeepAnalyze(propertyId: string) {
    setAnalyzingId(propertyId)
    const result = await invokeAgent('analyst', { property_id: propertyId })
    setAnalyzingId(null)
    if (result) {
      toast('Analysis complete', 'success')
      window.location.reload()
    } else {
      toast('Analysis failed — check Edge Function deployment', 'error')
    }
  }

  // Show scout results if we just ran a scout, otherwise show saved properties
  const displayProperties = scoutResults.length > 0 ? scoutResults : savedProperties

  return (
    <PageLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Scout</h1>

        <div className="flex gap-3">
          <Input
            placeholder="Zip code or market (e.g., 78704, Austin TX)..."
            value={market}
            onChange={(e) => setMarket(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleScout()}
            className="flex-1"
          />
          <Button onClick={handleScout} disabled={loading}>
            {loading ? 'Scouting...' : 'Scout Now'}
          </Button>
        </div>

        <ScoutedTerritories />

        {error && <p className="text-destructive text-sm">{error}</p>}

        <div className="relative">
          {loading && (
            <div className="absolute inset-0 z-10 flex items-center justify-center rounded-lg overflow-hidden">
              <div className="hyperdrive-stars absolute inset-0" />
              <p className="relative z-20 text-lg font-semibold text-white drop-shadow-lg">
                Scouting...
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {displayProperties.map((p) => (
              <DealCardMini
                key={p.id}
                property={p}
                pipelineEntry={getPipelineEntry(p.id)}
                onAddToPipeline={(id) => addToPipeline(id)}
                onDeepAnalyze={handleDeepAnalyze}
                analyzing={analyzingId === p.id}
              />
            ))}
          </div>
        </div>

        {displayProperties.length === 0 && !loading && (
          <p className="text-center text-muted-foreground py-12">
            No properties found. Enter a market and click Scout Now to find deals.
          </p>
        )}
      </div>
    </PageLayout>
  )
}
