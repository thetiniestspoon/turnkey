import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/contexts/auth-context'
import { EmojiPinSettings } from '@/components/auth/emoji-pin-settings'

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
  const [mobileOpen, setMobileOpen] = useState(false)

  return (
    <header className="border-b bg-card">
      <div className="flex items-center justify-between px-4 md:px-6 h-14">
        <div className="flex items-center gap-4 md:gap-6">
          <Link to="/" className="text-lg font-bold text-primary whitespace-nowrap">🦝 Turnkey</Link>
          {/* Mobile hamburger */}
          <button
            className="md:hidden p-1 text-muted-foreground"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="Toggle navigation"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
              {mobileOpen ? (
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              ) : (
                <path fillRule="evenodd" d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z" clipRule="evenodd" />
              )}
            </svg>
          </button>
          {/* Desktop nav */}
          <nav className="hidden md:flex items-center gap-1">
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
        <div className="flex items-center gap-2 md:gap-3">
          <Button variant="outline" size="sm" onClick={onToggleAdvisor} className="hidden sm:inline-flex">
            Ask Advisor
          </Button>
          <EmojiPinSettings />
          <span className="text-sm text-muted-foreground max-w-[120px] truncate" title={user?.email || ''}>
            {user?.email}
          </span>
          <Button variant="ghost" size="sm" onClick={signOut}>Sign out</Button>
        </div>
      </div>
      {/* Mobile nav dropdown */}
      {mobileOpen && (
        <nav className="md:hidden border-t px-4 py-2 flex flex-col gap-1 bg-card">
          {NAV_ITEMS.map(({ path, label }) => (
            <Link
              key={path}
              to={path}
              onClick={() => setMobileOpen(false)}
              className={`px-3 py-2 text-sm rounded-md transition-colors ${
                location.pathname === path
                  ? 'bg-accent text-accent-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {label}
            </Link>
          ))}
          <button
            onClick={() => { onToggleAdvisor(); setMobileOpen(false) }}
            className="px-3 py-2 text-sm text-left text-muted-foreground hover:text-foreground rounded-md"
          >
            Ask Advisor
          </button>
        </nav>
      )}
    </header>
  )
}
