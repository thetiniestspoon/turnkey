import { useState } from 'react'
import { supabase } from '@/lib/supabase'

type AgentType = 'scout' | 'analyst' | 'tracker' | 'advisor'

export function useAgent() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function invokeAgent<T = any>(agent: AgentType, payload: Record<string, any>): Promise<T | null> {
    setLoading(true)
    setError(null)
    try {
      const { data, error: fnError } = await supabase.functions.invoke(`agent-${agent}`, {
        body: payload,
      })
      if (fnError) throw fnError
      return data as T
    } catch (e: any) {
      setError(e.message || 'Agent invocation failed')
      return null
    } finally {
      setLoading(false)
    }
  }

  return { invokeAgent, loading, error }
}
