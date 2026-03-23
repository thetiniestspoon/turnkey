import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { formatCurrency, formatPercent } from '@/lib/utils'

interface Analysis {
  flip_arv: number; flip_renovation_est: number; flip_carrying_costs: number
  flip_total_investment: number; flip_profit_margin: number; flip_roi: number
  flip_timeline: string
  rental_monthly_est: number; rental_monthly_expenses: number
  rental_monthly_cash_flow: number; rental_annual_noi: number
  rental_cap_rate: number; rental_cash_on_cash: number
  recommended_strategy: string; confidence_score: number
  analysis_summary: string; agent_model: string; analyzed_at: string
}

export function DealCardFull({ analysis }: { analysis: Analysis }) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <Card className="border-green-600/30 bg-green-950/10">
        <CardHeader>
          <CardTitle className="text-sm text-green-500 flex justify-between">
            📐 FLIP SCENARIO
            {analysis.recommended_strategy === 'flip' && <Badge className="bg-green-600">Recommended</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div><span className="text-muted-foreground">Purchase:</span> {formatCurrency(analysis.flip_arv - analysis.flip_profit_margin - analysis.flip_carrying_costs - analysis.flip_renovation_est)}</div>
            <div><span className="text-muted-foreground">Renovation:</span> {formatCurrency(analysis.flip_renovation_est)}</div>
            <div><span className="text-muted-foreground">Carrying:</span> {formatCurrency(analysis.flip_carrying_costs)}</div>
            <div><span className="text-muted-foreground">Total Investment:</span> <span className="text-yellow-500">{formatCurrency(analysis.flip_total_investment)}</span></div>
            <div><span className="text-muted-foreground">ARV:</span> {formatCurrency(analysis.flip_arv)}</div>
            <div><span className="text-muted-foreground">Profit:</span> <span className="text-green-500 font-bold">{formatCurrency(analysis.flip_profit_margin)}</span></div>
            <div><span className="text-muted-foreground">ROI:</span> <span className="text-green-500 font-bold">{formatPercent(analysis.flip_roi)}</span></div>
            <div><span className="text-muted-foreground">Timeline:</span> {analysis.flip_timeline}</div>
          </div>
        </CardContent>
      </Card>

      <Card className="border-purple-600/30 bg-purple-950/10">
        <CardHeader>
          <CardTitle className="text-sm text-purple-400 flex justify-between">
            🏠 RENTAL SCENARIO
            {analysis.recommended_strategy === 'rental' && <Badge className="bg-purple-600">Recommended</Badge>}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="grid grid-cols-2 gap-2">
            <div><span className="text-muted-foreground">Monthly Rent:</span> {formatCurrency(analysis.rental_monthly_est)}</div>
            <div><span className="text-muted-foreground">Monthly Expenses:</span> {formatCurrency(analysis.rental_monthly_expenses)}</div>
            <div><span className="text-muted-foreground">Cash Flow:</span> <span className="text-purple-400 font-bold">{formatCurrency(analysis.rental_monthly_cash_flow)}/mo</span></div>
            <div><span className="text-muted-foreground">Annual NOI:</span> {formatCurrency(analysis.rental_annual_noi)}</div>
            <div><span className="text-muted-foreground">Cap Rate:</span> <span className="text-purple-400 font-bold">{formatPercent(analysis.rental_cap_rate)}</span></div>
            <div><span className="text-muted-foreground">Cash-on-Cash:</span> {formatPercent(analysis.rental_cash_on_cash)}</div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
