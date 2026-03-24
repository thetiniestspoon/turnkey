import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'

export interface Property {
  id: string
  address: string
  city: string
  state: string
  zip: string
  property_type: string | null
  bedrooms: number | null
  bathrooms: number | null
  sqft: number | null
  list_price: number | null
  lat: number | null
  lng: number | null
  source: string | null
  market_status: string | null
  stale_at: string | null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  raw_data: any
  created_at: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  property_analyses?: any[]
}

export function useProperties(filters?: { source?: string; state?: string; zip?: string }) {
  const [properties, setProperties] = useState<Property[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      setLoading(true)
      let query = supabase.from('properties')
        .select('*, property_analyses(*)')
        .order('created_at', { ascending: false })

      if (filters?.source) query = query.eq('source', filters.source)
      if (filters?.state) query = query.eq('state', filters.state)
      if (filters?.zip) query = query.eq('zip', filters.zip)

      const { data } = await query
      setProperties(data || [])
      setLoading(false)
    }
    fetch()
  }, [filters?.source, filters?.state, filters?.zip])

  return { properties, loading }
}

export function useProperty(id: string) {
  const [property, setProperty] = useState<Property | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetch() {
      const { data } = await supabase.from('properties')
        .select('*, property_analyses(*), property_predictions(*), property_notes(*)')
        .eq('id', id).single()
      setProperty(data)
      setLoading(false)
    }
    if (id) fetch()
  }, [id])

  return { property, loading }
}
