import { useState } from 'react'
import { PageLayout } from '@/components/layout/page-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DealCardMini } from '@/components/property/deal-card-mini'
import { useProperties } from '@/hooks/use-properties'
import { usePipeline } from '@/hooks/use-pipeline'
import { useAgent } from '@/hooks/use-agent'
import { supabase } from '@/lib/supabase'
import type { Property } from '@/hooks/use-properties'

export default function ScoutPage() {
  const [market, setMarket] = useState('')
  const [scoutResults, setScoutResults] = useState<Property[]>([])
  const { properties: savedProperties } = useProperties({ source: 'agent_scout' })
  const { addToPipeline } = usePipeline()
  const { invokeAgent, loading, error } = useAgent()

  async function handleScout() {
    if (!market.trim()) return
    const result = await invokeAgent<any>('scout', { market: market.trim(), filters: {} })
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
          scouted_at: new Date().toISOString(),
        },
      }, { onConflict: 'address,city,state' }).select().single()

      if (data) saved.push(data as Property)
    }

    setScoutResults(saved)
  }

  async function handleDeepAnalyze(propertyId: string) {
    await invokeAgent('analyst', { property_id: propertyId })
    window.location.reload()
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

        {error && <p className="text-destructive text-sm">{error}</p>}

        <div className="grid grid-cols-3 gap-4">
          {displayProperties.map((p) => (
            <DealCardMini
              key={p.id}
              property={p}
              onAddToPipeline={(id) => addToPipeline(id)}
              onDeepAnalyze={handleDeepAnalyze}
            />
          ))}
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
