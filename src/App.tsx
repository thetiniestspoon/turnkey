import { BrowserRouter, Routes, Route, Navigate, Link } from 'react-router-dom'
import { AuthProvider, useAuth } from '@/contexts/auth-context'
import { ToastProvider } from '@/components/ui/toast'
import LoginPage from '@/pages/login'
import DashboardPage from '@/pages/dashboard'
import ScoutPage from '@/pages/scout'
import DealCardPage from '@/pages/deal-card'
import PipelinePage from '@/pages/pipeline'
import MapViewPage from '@/pages/map-view'
import ContactsPage from '@/pages/contacts'
import PredictionsPage from '@/pages/predictions'
import WatchlistsPage from '@/pages/watchlists'

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) return <div className="min-h-screen flex items-center justify-center">Loading...</div>
  if (!user) return <Navigate to="/login" />
  return <>{children}</>
}

function NotFoundPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold">404</h1>
      <p className="text-muted-foreground">Page not found</p>
      <Link to="/" className="text-primary underline">Back to Dashboard</Link>
    </div>
  )
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
      <Route path="/scout" element={<ProtectedRoute><ScoutPage /></ProtectedRoute>} />
      <Route path="/property/:id" element={<ProtectedRoute><DealCardPage /></ProtectedRoute>} />
      <Route path="/pipeline" element={<ProtectedRoute><PipelinePage /></ProtectedRoute>} />
      <Route path="/map" element={<ProtectedRoute><MapViewPage /></ProtectedRoute>} />
      <Route path="/contacts" element={<ProtectedRoute><ContactsPage /></ProtectedRoute>} />
      <Route path="/predictions" element={<ProtectedRoute><PredictionsPage /></ProtectedRoute>} />
      <Route path="/watchlists" element={<ProtectedRoute><WatchlistsPage /></ProtectedRoute>} />
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  )
}

export default function App() {
  return (
    <BrowserRouter basename="/turnkey">
      <AuthProvider>
        <ToastProvider>
          <AppRoutes />
        </ToastProvider>
      </AuthProvider>
    </BrowserRouter>
  )
}
