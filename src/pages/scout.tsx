import { useState } from 'react'
import { PageLayout } from '@/components/layout/page-layout'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DealCardMini } from '@/components/property/deal-card-mini'
import { useProperties } from '@/hooks/use-properties'
import { usePipeline } from '@/hooks/use-pipeline'
import { useAgent } from '@/hooks/use-agent'

export default function ScoutPage() {
  const [market, setMarket] = useState('')
  const { properties } = useProperties({ source: 'agent_scout' })
  const { addToPipeline } = usePipeline()
  const { invokeAgent, loading, error } = useAgent()

  async function handleScout() {
    if (!market.trim()) return
    await invokeAgent('scout', { market: market.trim(), filters: {} })
    window.location.reload() // Simple refresh to show new properties
  }

  async function handleDeepAnalyze(propertyId: string) {
    await invokeAgent('analyst', { property_id: propertyId })
    window.location.reload()
  }

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
          {properties.map((p) => (
            <DealCardMini
              key={p.id}
              property={p}
              onAddToPipeline={(id) => addToPipeline(id)}
              onDeepAnalyze={handleDeepAnalyze}
            />
          ))}
        </div>

        {properties.length === 0 && !loading && (
          <p className="text-center text-muted-foreground py-12">
            No properties found. Enter a market and click Scout Now to find deals.
          </p>
        )}
      </div>
    </PageLayout>
  )
}
