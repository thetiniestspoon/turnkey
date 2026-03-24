import { useEffect, useState } from 'react'
import { PageLayout } from '@/components/layout/page-layout'
import { KPICards } from '@/components/dashboard/kpi-cards'
import { TopDealsList } from '@/components/dashboard/top-deals-list'
import { PipelineFeed } from '@/components/dashboard/pipeline-feed'
import { useProperties } from '@/hooks/use-properties'
import { usePipeline } from '@/hooks/use-pipeline'
import { usePredictions } from '@/hooks/use-predictions'
import { supabase } from '@/lib/supabase'

export default function DashboardPage() {
  const { properties } = useProperties({ source: 'agent_scout' })
  const { entries } = usePipeline()
  const { accuracy } = usePredictions()
  const [aiStats, setAiStats] = useState({ spend: 0, runs: 0 })

  useEffect(() => {
    async function fetchAiStats() {
      const startOfMonth = new Date()
      startOfMonth.setDate(1)
      startOfMonth.setHours(0, 0, 0, 0)

      const { data } = await supabase.from('agent_runs')
        .select('cost_est')
        .gte('started_at', startOfMonth.toISOString())
        .eq('status', 'success')

      const spend = (data || []).reduce((sum, r) => sum + (r.cost_est || 0), 0)
      setAiStats({ spend, runs: data?.length || 0 })
    }
    fetchAiStats()
  }, [])

  const activeEntries = entries.filter((e) => e.stage !== 'closed')
  const stageCounts = activeEntries.reduce((acc, e) => {
    acc[e.stage] = (acc[e.stage] || 0) + 1
    return acc
  }, {} as Record<string, number>)
  const breakdown = Object.entries(stageCounts).map(([s, c]) => `${c} ${s}`).join(' · ')

  // Today's deals
  const today = new Date().toISOString().split('T')[0]
  const todayDeals = properties.filter((p) => p.created_at.startsWith(today))

  return (
    <PageLayout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <KPICards data={{
          newDeals: todayDeals.length,
          activePipeline: activeEntries.length,
          pipelineBreakdown: breakdown || 'No active deals',
          predictionAccuracy: accuracy,
          aiSpend: aiStats.spend,
          aiRuns: aiStats.runs,
        }} />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="col-span-2">
            <TopDealsList properties={properties.slice(0, 5)} />
          </div>
          <PipelineFeed entries={entries} />
        </div>
      </div>
    </PageLayout>
  )
}
