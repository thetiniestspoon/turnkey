import { useEffect, useState } from 'react'
import { motion } from 'framer-motion'
import { supabase } from '@/lib/supabase'

interface AgentRun {
  id: string
  agent_type: string
  status: string
  started_at: string
}

function relativeTime(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

function statusColor(status: string) {
  if (status === 'success') return 'bg-green-500'
  if (status === 'error' || status === 'failed') return 'bg-red-500'
  return 'bg-yellow-500'
}

export function AgentPulse() {
  const [runs, setRuns] = useState<AgentRun[]>([])

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase
        .from('agent_runs')
        .select('id, agent_type, status, started_at')
        .order('started_at', { ascending: false })
        .limit(5)
      if (data) setRuns(data)
    }
    fetch()
  }, [])

  if (runs.length === 0) return null

  return (
    <div className="flex gap-2 flex-wrap">
      {runs.map((run, i) => (
        <motion.div
          key={run.id}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.08, duration: 0.3 }}
          className="flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs"
        >
          <span className={`inline-block w-2 h-2 rounded-full ${statusColor(run.status)}`} aria-label={`${run.agent_type} ${run.status}`} />
          <span className="font-medium">{run.agent_type}</span>
          <span className="text-muted-foreground">{relativeTime(run.started_at)}</span>
        </motion.div>
      ))}
    </div>
  )
}
