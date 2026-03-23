import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export function useMarketData() {
  const [loading, setLoading] = useState(false)

  async function getMarketData(region: string, regionType: string = 'zip') {
    setLoading(true)
    const { data } = await supabase.from('market_data')
      .select('*')
      .eq('region', region)
      .eq('region_type', regionType)
      .gt('expires_at', new Date().toISOString())
    setLoading(false)
    return data || []
  }

  return { getMarketData, loading }
}
