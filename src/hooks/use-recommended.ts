import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import type { Property } from '@/hooks/use-properties'

export function useRecommended() {
  const { user } = useAuth()
  const [recommended, setRecommended] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)

  const fetchRecommended = useCallback(async () => {
    if (!user) return
    setLoading(true)
    const { data } = await supabase
      .from('user_recommendations')
      .select('*, properties(*, property_analyses(*))')
      .eq('user_id', user.id)
      .eq('recommended', true)
      .is('dismissed_at', null)

    const rows = (data || [])
      .map((row: { properties: Property }) => row.properties)
      .filter(Boolean)
      .filter((p: Property) => p.market_status === 'active' || p.market_status === null)

    setRecommended(rows)
    setLoading(false)
  }, [user])

  useEffect(() => { fetchRecommended() }, [fetchRecommended])

  async function dismiss(propertyId: string) {
    if (!user) return
    await supabase
      .from('user_recommendations')
      .update({ dismissed_at: new Date().toISOString(), recommended: false })
      .eq('user_id', user.id)
      .eq('property_id', propertyId)
    setRecommended((prev) => prev.filter((p) => p.id !== propertyId))
  }

  async function watchProperty(propertyId: string) {
    if (!user) return
    // Insert into pipeline at 'watching' stage (ignore error if duplicate)
    await supabase.from('pipeline').insert({
      property_id: propertyId,
      user_id: user.id,
      stage: 'watching',
    })
    await dismiss(propertyId)
  }

  return { recommended, dismiss, watchProperty, loading }
}
