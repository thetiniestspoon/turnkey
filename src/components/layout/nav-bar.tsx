import { Link, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/auth-context'

const NAV_ITEMS = [
  { path: '/', label: 'Dashboard' },
  { path: '/scout', label: 'Scout' },
  { path: '/pipeline', label: 'Pipeline' },
  { path: '/map', label: 'Map' },
  { path: '/contacts', label: 'Contacts' },
  { path: '/predictions', label: 'Predictions' },
  { path: '/watchlists', label: 'Watchlists' },
]

export function NavBar({ onToggleAdvisor }: { onToggleAdvisor: () => void }) {
  const location = useLocation()
  const { user, signOut } = useAuth()

  return (
    <header className="border-b bg-card">
      <div className="flex items-center justify-between px-6 h-14">
        <div className="flex items-center gap-6">
          <Link to="/" className="text-lg font-bold text-primary">🔑 Turnkey</Link>
          <nav className="flex items-center gap-1">
            {NAV_ITEMS.map(({ path, label }) => (
              <Link
                key={path}
                to={path}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  location.pathname === path
                    ? 'bg-accent text-accent-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={onToggleAdvisor}>
            💬 Ask Advisor
          </Button>
          <span className="text-sm text-muted-foreground">{user?.email}</span>
          <Button variant="ghost" size="sm" onClick={signOut}>Sign out</Button>
        </div>
      </div>
    </header>
  )
}
