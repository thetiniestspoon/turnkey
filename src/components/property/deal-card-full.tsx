import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
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

type Tab = 'flip' | 'rental'

export function DealCardFull({ analysis }: { analysis: Analysis }) {
  const [activeTab, setActiveTab] = useState<Tab>(
    analysis.recommended_strategy === 'rental' ? 'rental' : 'flip'
  )

  return (
    <div className="space-y-3">
      {/* Tab bar */}
      <div className="relative flex gap-1 bg-muted rounded-lg p-1">
        {(['flip', 'rental'] as Tab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`relative flex-1 px-4 py-2 text-sm font-medium rounded-md transition-colors z-10 ${
              activeTab === tab ? 'text-foreground' : 'text-muted-foreground hover:text-foreground/70'
            }`}
          >
            {tab === 'flip' ? '📐 Flip Scenario' : '🏠 Rental Scenario'}
            {analysis.recommended_strategy === tab && (
              <Badge className="ml-2 text-[10px] bg-green-600">Recommended</Badge>
            )}
            {activeTab === tab && (
              <motion.div
                layoutId="deal-tab-underline"
                className="absolute inset-0 bg-card rounded-md shadow-sm -z-10"
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        ))}
      </div>

      {/* Tab content with crossfade */}
      <AnimatePresence mode="wait">
        {activeTab === 'flip' ? (
          <motion.div
            key="flip"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="border-green-600/30 bg-green-950/10">
              <CardHeader>
                <CardTitle className="text-sm text-green-500">📐 FLIP ANALYSIS</CardTitle>
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
          </motion.div>
        ) : (
          <motion.div
            key="rental"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.2 }}
          >
            <Card className="border-purple-600/30 bg-purple-950/10">
              <CardHeader>
                <CardTitle className="text-sm text-purple-400">🏠 RENTAL ANALYSIS</CardTitle>
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
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
