interface WalkabilityData {
  walk_score?: number
  transit_score?: number
  bike_score?: number
}

function scoreColor(score: number): string {
  if (score >= 70) return '#22c55e' // green
  if (score >= 40) return '#eab308' // yellow
  return '#ef4444' // red
}

function scoreLabel(score: number): string {
  if (score >= 90) return 'Walker\'s Paradise'
  if (score >= 70) return 'Very Walkable'
  if (score >= 50) return 'Somewhat Walkable'
  if (score >= 25) return 'Car-Dependent'
  return 'Almost All Driving'
}

export function WalkabilityGauge({ data }: { data: WalkabilityData }) {
  const score = data.walk_score ?? 0
  const color = scoreColor(score)
  const radius = 40
  const stroke = 6
  const circumference = 2 * Math.PI * radius
  const progress = (score / 100) * circumference
  const size = (radius + stroke) * 2

  const categories = [
    { label: 'Walk', value: data.walk_score },
    { label: 'Transit', value: data.transit_score },
    { label: 'Bike', value: data.bike_score },
  ].filter((c) => c.value != null) as { label: string; value: number }[]

  return (
    <div className="flex flex-col items-center gap-3">
      {/* Circular gauge */}
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="transform -rotate-90">
          {/* Background circle */}
          <circle
            cx={radius + stroke}
            cy={radius + stroke}
            r={radius}
            fill="none"
            stroke="currentColor"
            className="text-muted"
            strokeWidth={stroke}
          />
          {/* Progress arc */}
          <circle
            cx={radius + stroke}
            cy={radius + stroke}
            r={radius}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={circumference - progress}
            style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
          />
        </svg>
        {/* Center label */}
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-xl font-bold" style={{ color }}>{score}</span>
          <span className="text-[9px] text-muted-foreground">Walk Score</span>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">{scoreLabel(score)}</p>

      {/* Category breakdown bars */}
      {categories.length > 0 && (
        <div className="w-full max-w-[180px] space-y-1.5">
          {categories.map((cat) => (
            <div key={cat.label} className="flex items-center gap-2 text-xs">
              <span className="w-12 text-muted-foreground text-right">{cat.label}</span>
              <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-700"
                  style={{
                    width: `${cat.value}%`,
                    backgroundColor: scoreColor(cat.value),
                  }}
                />
              </div>
              <span className="w-6 text-right font-medium" style={{ color: scoreColor(cat.value) }}>
                {cat.value}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
