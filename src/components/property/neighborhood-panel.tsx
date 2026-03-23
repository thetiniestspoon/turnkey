import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface NeighborhoodData {
  census_acs?: { median_income?: number; population?: number; housing_units?: number }
  fred_rates?: { mortgage_30yr?: number; as_of?: string }
  hud_fmr?: { fmr_2br?: number; fmr_3br?: number; year?: number }
}

export function NeighborhoodPanel({ data, zip }: { data: NeighborhoodData; zip: string }) {
  const census = data?.census_acs
  const fred = data?.fred_rates
  const hud = data?.hud_fmr

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">📍 Neighborhood Intelligence ({zip})</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 gap-4 text-center">
          <div>
            <p className="text-xs text-muted-foreground">Median Income</p>
            <p className="text-lg font-bold">{census?.median_income ? `$${census.median_income.toLocaleString()}` : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Population</p>
            <p className="text-lg font-bold">{census?.population?.toLocaleString() ?? '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">30yr Mortgage</p>
            <p className="text-lg font-bold">{fred?.mortgage_30yr ? `${fred.mortgage_30yr}%` : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">FMR (3br)</p>
            <p className="text-lg font-bold">{hud?.fmr_3br ? `$${hud.fmr_3br.toLocaleString()}` : '—'}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
