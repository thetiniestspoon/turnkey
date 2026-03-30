import { useRef, useState } from 'react'
import { cn } from '@/lib/utils'

export function CardSpotlight({ children, className }: { children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [hovering, setHovering] = useState(false)

  return (
    <div
      ref={ref}
      className={cn('relative overflow-hidden rounded-xl border bg-card', className)}
      onMouseMove={(e) => {
        const rect = ref.current?.getBoundingClientRect()
        if (rect) setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top })
      }}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {hovering && (
        <div
          className="pointer-events-none absolute inset-0 z-10 transition-opacity duration-300"
          style={{
            background: `radial-gradient(400px circle at ${pos.x}px ${pos.y}px, oklch(0.7 0.15 85 / 0.12), transparent 60%)`,
          }}
        />
      )}
      {children}
    </div>
  )
}
