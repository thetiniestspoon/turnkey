import { Card, CardContent } from '@/components/ui/card'

interface KPIData {
  newDeals: number
  activePipeline: number
  pipelineBreakdown: string
  predictionAccuracy: number | null
  aiSpend: number
  aiRuns: number
}

export function KPICards({ data }: { data: KPIData }) {
  return (
    <div className="grid grid-cols-4 gap-4">
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-sm text-muted-foreground">New Deals Today</p>
          <p className="text-3xl font-bold text-primary">{data.newDeals}</p>
          <p className="text-xs text-muted-foreground">from overnight scout</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-sm text-muted-foreground">Active Pipeline</p>
          <p className="text-3xl font-bold text-yellow-500">{data.activePipeline}</p>
          <p className="text-xs text-muted-foreground">{data.pipelineBreakdown}</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-sm text-muted-foreground">Prediction Accuracy</p>
          <p className="text-3xl font-bold text-green-500">
            {data.predictionAccuracy !== null ? `${data.predictionAccuracy}%` : '—'}
          </p>
          <p className="text-xs text-muted-foreground">across tracked properties</p>
        </CardContent>
      </Card>
      <Card>
        <CardContent className="pt-6 text-center">
          <p className="text-sm text-muted-foreground">AI Spend (MTD)</p>
          <p className="text-3xl font-bold">${data.aiSpend.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">{data.aiRuns} agent runs</p>
        </CardContent>
      </Card>
    </div>
  )
}
