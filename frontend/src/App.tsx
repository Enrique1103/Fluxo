import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { useAuthStore } from './store/authStore'
import { ThemeProvider } from './hooks/useTheme'
import DashboardPage from './pages/DashboardPage'

const LoginPage         = lazy(() => import('./pages/LoginPage'))
const StatsDashboardPage = lazy(() => import('./pages/StatsDashboardPage'))
const ImportacionPage   = lazy(() => import('./pages/ImportacionPage'))
const HouseholdPage     = lazy(() => import('./pages/HouseholdPage'))

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  return token ? <>{children}</> : <Navigate to="/login" replace />
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Suspense fallback={<div style={{ display: 'flex', height: '100vh', alignItems: 'center', justifyContent: 'center' }}>Cargando…</div>}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/" element={<PrivateRoute><DashboardPage /></PrivateRoute>} />
              <Route path="/stats" element={<PrivateRoute><StatsDashboardPage /></PrivateRoute>} />
              <Route path="/importacion" element={<PrivateRoute><ImportacionPage /></PrivateRoute>} />
              <Route path="/hogar" element={<PrivateRoute><HouseholdPage /></PrivateRoute>} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </BrowserRouter>
      </QueryClientProvider>
    </ThemeProvider>
  )
}
