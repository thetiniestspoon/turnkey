import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'

interface AgentRun {
  id: string
  agent_type: string
  status: string
  started_at: string
  finished_at: string | null
  summary: string | null
}

const STATUS_COLORS: Record<string, string> = {
  success: '#22c55e',
  completed: '#22c55e',
  running: '#3b82f6',
  pending: '#eab308',
  failed: '#ef4444',
  error: '#ef4444',
}

const AGENT_ICONS: Record<string, string> = {
  scout: '🔍',
  analyst: '🔬',
  tracker: '📈',
  advisor: '🧠',
}

export function AgentTimeline({ propertyId }: { propertyId: string }) {
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('agent_runs')
        .select('id, agent_type, status, started_at, finished_at, summary')
        .eq('property_id', propertyId)
        .order('started_at', { ascending: false })
        .limit(20)
      setRuns(data || [])
      setLoading(false)
    }
    fetch()
  }, [propertyId])

  if (loading) return <p className="text-xs text-muted-foreground">Loading agent history...</p>
  if (runs.length === 0) return null

  return (
    <div className="space-y-1">
      <h3 className="text-sm font-semibold mb-3">Agent Activity</h3>
      <div className="relative pl-6">
        {/* Connecting line */}
        <div className="absolute left-[9px] top-2 bottom-2 w-px bg-border" />

        {runs.map((run, i) => (
          <motion.div
            key={run.id}
            initial={{ opacity: 0, x: -12 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.08, duration: 0.3 }}
            className="relative pb-4 last:pb-0"
          >
            {/* Status dot */}
            <div
              className="absolute -left-6 top-1 w-[18px] h-[18px] rounded-full border-2 border-background flex items-center justify-center text-[9px]"
              style={{ backgroundColor: STATUS_COLORS[run.status] || '#888' }}
            >
              <span className="leading-none">{AGENT_ICONS[run.agent_type] || '⚙'}</span>
            </div>

            <div className="ml-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium capitalize">{run.agent_type}</span>
                <span
                  className="text-[10px] px-1.5 py-0.5 rounded-full font-medium"
                  style={{
                    backgroundColor: `${STATUS_COLORS[run.status] || '#888'}20`,
                    color: STATUS_COLORS[run.status] || '#888',
                  }}
                >
                  {run.status}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground">
                {new Date(run.started_at).toLocaleString()}
              </p>
              {run.summary && (
                <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{run.summary}</p>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  )
}
