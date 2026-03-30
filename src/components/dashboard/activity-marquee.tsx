import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface MarqueeRun {
  id: string
  agent_type: string
  output_summary: string | null
}

export function ActivityMarquee() {
  const [items, setItems] = useState<MarqueeRun[]>([])

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('agent_runs')
        .select('id, agent_type, output_summary')
        .eq('status', 'success')
        .order('started_at', { ascending: false })
        .limit(10)
      if (data) setItems(data)
    }
    fetch()
  }, [])

  if (items.length === 0) return null

  const text = items
    .map((r) => r.output_summary || `${r.agent_type} completed`)
    .join('  \u2022  ')

  return (
    <div
      className="overflow-hidden rounded-lg border bg-card py-2"
      role="region"
      aria-label="Recent agent activity"
    >
      <div className="marquee-track flex whitespace-nowrap">
        <span className="marquee-content text-xs text-muted-foreground px-4">
          {text}
        </span>
        <span className="marquee-content text-xs text-muted-foreground px-4" aria-hidden>
          {text}
        </span>
      </div>
    </div>
  )
}
