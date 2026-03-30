import { useState } from 'react'
import type { ReactNode } from 'react'
import { NavBar } from './nav-bar'
import { AdvisorPanel } from './advisor-panel'
import { AdvisorOrb } from '@/components/advisor/advisor-orb'

export function PageLayout({ children }: { children: ReactNode }) {
  const [advisorOpen, setAdvisorOpen] = useState(false)

  return (
    <div className="min-h-screen bg-background overflow-x-hidden">
      <NavBar onToggleAdvisor={() => setAdvisorOpen(!advisorOpen)} />
      <main className="p-4 md:p-6 max-w-full">{children}</main>
      <AdvisorPanel open={advisorOpen} onClose={() => setAdvisorOpen(false)} />
      <AdvisorOrb onClick={() => setAdvisorOpen(!advisorOpen)} />
    </div>
  )
}
