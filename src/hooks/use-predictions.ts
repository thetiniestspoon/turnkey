import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'

export interface Prediction {
  id: string
  property_id: string
  metric: string
  predicted_value: number
  actual_value: number | null
  accuracy_score: number | null
  predicted_at: string
  resolved_at: string | null
  properties?: { address: string; city: string; state: string }
}

export function usePredictions() {
  const [predictions, setPredictions] = useState<Prediction[]>([])
  const [loading, setLoading] = useState(true)
  const [accuracy, setAccuracy] = useState<number | null>(null)

  const fetchPredictions = useCallback(async () => {
    const { data } = await supabase.from('property_predictions')
      .select('*, properties(address, city, state)')
      .order('predicted_at', { ascending: false })
    setPredictions(data || [])

    // Compute system-wide accuracy
    const resolved = (data || []).filter((p: Prediction) => p.accuracy_score !== null)
    if (resolved.length > 0) {
      const avg = resolved.reduce((sum: number, p: Prediction) => sum + (p.accuracy_score ?? 0), 0) / resolved.length
      setAccuracy(Math.round(avg * 10) / 10)
    }
    setLoading(false)
  }, [])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { fetchPredictions() }, [fetchPredictions])

  async function updateActual(predictionId: string, actualValue: number) {
    const { error } = await supabase.from('property_predictions')
      .update({ actual_value: actualValue })
      .eq('id', predictionId)
    if (!error) await fetchPredictions()
    return error
  }

  return { predictions, loading, accuracy, updateActual, refetch: fetchPredictions }
}
