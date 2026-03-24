import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type AgentType = 'scout' | 'analyst' | 'tracker' | 'advisor'

export function useAgent() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function invokeAgent<T = unknown>(agent: AgentType, payload: Record<string, unknown>): Promise<T | null> {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke(`agent-${agent}`, {
        body: payload,
      })
      if (fnError) throw fnError
      return data as T
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Agent invocation failed'
      setError(message)
      return null
    } finally {
      setLoading(false)
    }
  }

  return { invokeAgent, loading, error }
}
