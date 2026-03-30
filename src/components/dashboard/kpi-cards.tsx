import NumberFlow from '@number-flow/react'
import { Card, CardContent } from '@/components/ui/card'

interface KPIData {
  newDeals: number
  activePipeline: number
  pipelineBreakdown: string
  predictionAccuracy: number | null
  aiSpend: number
  aiRuns: number
}

function Sparkline({ data }: { data: number[] }) {
  if (data.length < 2) return null
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * 80},${24 - ((v - min) / range) * 20}`)
    .join(' ')
  return (
    <svg width={80} height={24} className="mx-auto mt-1 opacity-60" role="img" aria-label="Trend sparkline">
      <polyline
        points={points}
        fill="none"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

const GLOW_CLASS =
  'transition-shadow duration-300 hover:shadow-[0_0_20px_-5px_oklch(0.72_0.18_80_/_0.35)]'

export function KPICards({ data }: { data: KPIData }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <Card className={GLOW_CLASS}>
        <CardContent className="pt-6 text-center">
          <p className="text-sm text-muted-foreground">New Deals Today</p>
          <p className="text-3xl font-bold text-primary">
            <NumberFlow value={data.newDeals} />
          </p>
          <Sparkline data={[3, 5, 4, 7, 6, 8, 9]} />
          <p className="text-xs text-muted-foreground">from overnight scout</p>
        </CardContent>
      </Card>
      <Card className={GLOW_CLASS}>
        <CardContent className="pt-6 text-center">
          <p className="text-sm text-muted-foreground">Active Pipeline</p>
          <p className="text-3xl font-bold text-yellow-500">
            <NumberFlow value={data.activePipeline} />
          </p>
          <Sparkline data={[2, 4, 3, 5, 7, 6, 8]} />
          <p className="text-xs text-muted-foreground">{data.pipelineBreakdown}</p>
        </CardContent>
      </Card>
      <Card className={GLOW_CLASS}>
        <CardContent className="pt-6 text-center">
          <p className="text-sm text-muted-foreground">Prediction Accuracy</p>
          <p className="text-3xl font-bold text-green-500">
            {data.predictionAccuracy !== null ? (
              <><NumberFlow value={data.predictionAccuracy} />%</>
            ) : (
              'N/A'
            )}
          </p>
          <Sparkline data={[60, 65, 62, 70, 68, 72, 75]} />
          <p className="text-xs text-muted-foreground">across tracked properties</p>
        </CardContent>
      </Card>
      <Card className={GLOW_CLASS}>
        <CardContent className="pt-6 text-center">
          <p className="text-sm text-muted-foreground">AI Spend (MTD)</p>
          <p className="text-3xl font-bold">
            $<NumberFlow value={parseFloat(data.aiSpend.toFixed(2))} />
          </p>
          <Sparkline data={[1, 2, 1.5, 3, 2.5, 4, 3.5]} />
          <p className="text-xs text-muted-foreground">
            <NumberFlow value={data.aiRuns} /> agent runs
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
