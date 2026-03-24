import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { STAGE_COLORS } from '@/data/pipeline-stages'
import type { PipelineEntry } from '@/hooks/use-pipeline'

export function PipelineFeed({ entries }: { entries: PipelineEntry[] }) {
  const recent = entries.slice(0, 5)

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">📋 Pipeline Updates</CardTitle></CardHeader>
      <CardContent className="space-y-2">
        {recent.length === 0 && (
          <p className="text-sm text-muted-foreground">No pipeline activity yet.</p>
        )}
        {recent.map((entry) => (
          <div key={entry.id} className="flex items-center gap-2 text-sm min-w-0">
            <span className="shrink-0" style={{ color: STAGE_COLORS[entry.stage] }}>●</span>
            <span className="truncate">{entry.properties?.address}</span>
            <span className="text-muted-foreground shrink-0">→ {entry.stage}</span>
          </div>
        ))}
      </CardContent>
    </Card>
  )
}
