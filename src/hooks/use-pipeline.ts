import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/auth-context'
import { isValidTransition } from '@/data/pipeline-stages'
import type { PipelineStage } from '@/data/pipeline-stages'

export interface PipelineEntry {
  id: string
  property_id: string
  stage: PipelineStage
  entered_stage_at: string
  purchase_price: number | null
  sale_price: number | null
  outcome: string | null
  properties?: any
}

export function usePipeline() {
  const { user } = useAuth()
  const [entries, setEntries] = useState<PipelineEntry[]>([])
  const [loading, setLoading] = useState(true)

  async function fetchPipeline() {
    if (!user) return
    const { data } = await supabase.from('pipeline')
      .select('*, properties(address, city, state, zip, list_price, raw_data, property_analyses(*))')
      .eq('user_id', user.id)
      .order('entered_stage_at', { ascending: false })
    setEntries(data || [])
    setLoading(false)
  }

  useEffect(() => { fetchPipeline() }, [user])

  async function addToPipeline(propertyId: string) {
    if (!user) return
    const { error } = await supabase.from('pipeline').insert({
      property_id: propertyId, user_id: user.id, stage: 'watching',
    })
    if (!error) await fetchPipeline()
    return error
  }

  async function moveStage(pipelineId: string, currentStage: PipelineStage, newStage: PipelineStage) {
    if (!isValidTransition(currentStage, newStage)) {
      return new Error(`Invalid transition: ${currentStage} → ${newStage}`)
    }
    const { error } = await supabase.from('pipeline')
      .update({ stage: newStage })
      .eq('id', pipelineId)
    if (!error) await fetchPipeline()
    return error
  }

  return { entries, loading, addToPipeline, moveStage, refetch: fetchPipeline }
}
