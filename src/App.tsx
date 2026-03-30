import { BrowserRouter, Routes, Route, Navigate, Link, useLocation } from 'react-router-dom'
import { AnimatePresence, motion } from 'framer-motion'
import { AuthProvider, useAuth } from '@/contexts/auth-context'
import { ThemeProvider } from '@/contexts/theme-context'
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

function PageTransition({ children }: { children: React.ReactNode }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ duration: 0.2 }}
    >
      {children}
    </motion.div>
  )
}

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
  const location = useLocation()
  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/login" element={<PageTransition><LoginPage /></PageTransition>} />
        <Route path="/" element={<ProtectedRoute><PageTransition><DashboardPage /></PageTransition></ProtectedRoute>} />
        <Route path="/scout" element={<ProtectedRoute><PageTransition><ScoutPage /></PageTransition></ProtectedRoute>} />
        <Route path="/property/:id" element={<ProtectedRoute><PageTransition><DealCardPage /></PageTransition></ProtectedRoute>} />
        <Route path="/pipeline" element={<ProtectedRoute><PageTransition><PipelinePage /></PageTransition></ProtectedRoute>} />
        <Route path="/map" element={<ProtectedRoute><PageTransition><MapViewPage /></PageTransition></ProtectedRoute>} />
        <Route path="/contacts" element={<ProtectedRoute><PageTransition><ContactsPage /></PageTransition></ProtectedRoute>} />
        <Route path="/predictions" element={<ProtectedRoute><PageTransition><PredictionsPage /></PageTransition></ProtectedRoute>} />
        <Route path="/watchlists" element={<ProtectedRoute><PageTransition><WatchlistsPage /></PageTransition></ProtectedRoute>} />
        <Route path="*" element={<PageTransition><NotFoundPage /></PageTransition>} />
      </Routes>
    </AnimatePresence>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <ToastProvider>
            <AppRoutes />
          </ToastProvider>
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  )
}
