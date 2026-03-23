import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { useAgent } from '@/hooks/use-agent'

export interface Watchlist {
  id: string
  name: string
  zip: string
  city: string | null
  state: string | null
  criteria_overrides: Record<string, any> | null
  active: boolean | null
  last_scouted_at: string | null
  created_at: string | null
  updated_at: string | null
}

export function useWatchlists() {
  const { user } = useAuth()
  const { invokeAgent, loading: agentLoading } = useAgent()
  const [watchlists, setWatchlists] = useState<Watchlist[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchWatchlists() {
    if (!user) return
    const { data } = await supabase
      .from('watchlists')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    setWatchlists((data as Watchlist[]) || [])
    setLoading(false)
  }

  useEffect(() => {
    fetchWatchlists()
  }, [user])

  async function addWatchlist(data: {
    name: string
    zip: string
    city?: string
    state?: string
    criteria_overrides?: Record<string, any>
  }) {
    if (!user) return
    const { error } = await supabase.from('watchlists').insert({
      ...data,
      user_id: user.id,
    })
    if (!error) await fetchWatchlists()
    return error
  }

  async function updateWatchlist(
    id: string,
    updates: Partial<Omit<Watchlist, 'id'>>
  ) {
    const { error } = await supabase
      .from('watchlists')
      .update(updates)
      .eq('id', id)
    if (!error) await fetchWatchlists()
    return error
  }

  async function deleteWatchlist(id: string) {
    const { error } = await supabase.from('watchlists').delete().eq('id', id)
    if (!error) await fetchWatchlists()
    return error
  }

  async function toggleActive(id: string, active: boolean) {
    return updateWatchlist(id, { active })
  }

  async function scoutNow(zip: string) {
    return invokeAgent('scout', { market: zip })
  }

  return {
    watchlists,
    loading,
    agentLoading,
    addWatchlist,
    updateWatchlist,
    deleteWatchlist,
    toggleActive,
    scoutNow,
    refetch: fetchWatchlists,
  }
}
