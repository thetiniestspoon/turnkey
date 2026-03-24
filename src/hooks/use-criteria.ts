import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'

export interface InvestmentCriteria {
  id: string
  max_price: number | null
  min_cap_rate: number | null
  min_flip_roi: number | null
  min_score: number | null
  property_types: string[] | null
  strategies: string[] | null
}

export function useCriteria() {
  const { user } = useAuth()
  const [criteria, setCriteria] = useState<InvestmentCriteria | null>(null)
  const [loading, setLoading] = useState(true)

  const fetchCriteria = useCallback(async () => {
    if (!user) return
    const { data } = await supabase
      .from('investment_criteria')
      .select('*')
      .eq('user_id', user.id)
      .single()
    setCriteria(data as InvestmentCriteria | null)
    setLoading(false)
  }, [user])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchCriteria()
  }, [fetchCriteria])

  async function saveCriteria(values: {
    max_price?: number | null
    min_cap_rate?: number | null
    min_flip_roi?: number | null
    min_score?: number | null
    property_types?: string[]
    strategies?: string[]
  }) {
    if (!user) return
    if (criteria) {
      // Update existing row
      const { error } = await supabase
        .from('investment_criteria')
        .update({ ...values, updated_at: new Date().toISOString() })
        .eq('id', criteria.id)
      if (!error) await fetchCriteria()
      return error
    } else {
      // Insert new row
      const { error } = await supabase
        .from('investment_criteria')
        .insert({ ...values, user_id: user.id })
      if (!error) await fetchCriteria()
      return error
    }
  }

  return { criteria, loading, saveCriteria, refetch: fetchCriteria }
}
