import { useState } from 'react'
import { PageLayout } from '@/components/layout/page-layout'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { usePredictions } from '@/hooks/use-predictions'
import { useAgent } from '@/hooks/use-agent'
import { formatCurrency } from '@/lib/utils'

export default function PredictionsPage() {
  const { predictions, loading, accuracy, updateActual } = usePredictions()
  const { invokeAgent } = useAgent()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')

  async function handleSaveActual(predictionId: string, propertyId: string) {
    const val = parseFloat(editValue)
    if (isNaN(val)) return
    await updateActual(predictionId, val)
    setEditingId(null)
    setEditValue('')
    // Trigger tracker agent
    await invokeAgent('tracker', { property_id: propertyId })
  }

  return (
    <PageLayout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold">Predictions</h1>
          {accuracy !== null && (
            <Card><CardContent className="py-2 px-4">
              <span className="text-sm text-muted-foreground mr-2">System Accuracy:</span>
              <span className="text-xl font-bold text-green-500">{accuracy}%</span>
            </CardContent></Card>
          )}
        </div>

        {loading ? <p>Loading...</p> : predictions.length === 0 ? (
          <p className="text-muted-foreground text-center py-12">No predictions yet. Analyze properties to generate predictions.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Property</TableHead>
                <TableHead>Metric</TableHead>
                <TableHead className="text-right">Predicted</TableHead>
                <TableHead className="text-right">Actual</TableHead>
                <TableHead className="text-right">Accuracy</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {predictions.map((pred) => (
                <TableRow key={pred.id}>
                  <TableCell className="font-medium">
                    {pred.properties?.address}, {pred.properties?.city} {pred.properties?.state}
                  </TableCell>
                  <TableCell className="capitalize">{pred.metric.replace('_', ' ')}</TableCell>
                  <TableCell className="text-right">{formatCurrency(pred.predicted_value)}</TableCell>
                  <TableCell className="text-right">
                    {editingId === pred.id ? (
                      <div className="flex gap-1 justify-end">
                        <Input className="w-28 h-8" value={editValue} onChange={(e) => setEditValue(e.target.value)} type="number" />
                        <Button size="sm" variant="outline" onClick={() => handleSaveActual(pred.id, pred.property_id)}>Save</Button>
                      </div>
                    ) : pred.actual_value !== null ? (
                      formatCurrency(pred.actual_value)
                    ) : (
                      <Button size="sm" variant="ghost" onClick={() => { setEditingId(pred.id); setEditValue('') }}>Enter actual</Button>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {pred.accuracy_score !== null ? (
                      <span className={pred.accuracy_score >= 90 ? 'text-green-500' : pred.accuracy_score >= 70 ? 'text-yellow-500' : 'text-red-500'}>
                        {pred.accuracy_score.toFixed(1)}%
                      </span>
                    ) : '—'}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </PageLayout>
  )
}
