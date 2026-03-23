import { useState } from 'react'
import type { ReactNode } from 'react'
import { NavBar } from './nav-bar'
import { AdvisorPanel } from './advisor-panel'

export function PageLayout({ children }: { children: ReactNode }) {
  const [advisorOpen, setAdvisorOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background">
      <NavBar onToggleAdvisor={() => setAdvisorOpen(!advisorOpen)} />
      <main className="p-6">{children}</main>
      <AdvisorPanel open={advisorOpen} onClose={() => setAdvisorOpen(false)} />
    </div>
  )
}
