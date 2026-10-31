import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClient } from './lib/queryClient'
import { useAuthStore } from './store/authStore'
import { ThemeProvider } from './hooks/useTheme'
import DashboardPage from './pages/DashboardPage'
import MobileNav from './components/MobileNav'

const LoginPage          = lazy(() => import('./pages/LoginPage'))
const StatsDashboardPage = lazy(() => import('./pages/StatsDashboardPage'))
const ImportacionPage    = lazy(() => import('./pages/ImportacionPage'))
const HouseholdPage      = lazy(() => import('./pages/HouseholdPage'))
const AdminPage          = lazy(() => import('./pages/AdminPage'))

/** Pantalla de carga con la marca (mientras se descarga cada pantalla) */
function SplashScreen() {
  return (
    <div className="min-h-dvh flex flex-col items-center justify-center gap-5 bg-[#020817]">
      <h1 className="text-4xl font-black tracking-tighter leading-none">
        <span className="text-white">Fl</span><span className="text-emerald-400">uxo</span>
      </h1>
      <span className="w-6 h-6 border-2 border-emerald-400/25 border-t-emerald-400 rounded-full animate-spin" />
    </div>
  )
}

/** Decodifica el payload del JWT y devuelve true si expiró (sin verificar firma). */
function isTokenExpired(token: string): boolean {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]))
    return typeof payload.exp === 'number' && payload.exp * 1000 < Date.now()
  } catch {
    return true
  }
}

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  const logout = useAuthStore((s) => s.logout)
  const isAdmin = useAuthStore((s) => s.isAdmin)
  if (!token || isTokenExpired(token)) {
    if (token) logout()
    return <Navigate to="/login" replace />
  }
  if (isAdmin) return <Navigate to="/admin" replace />
  return <>{children}<MobileNav /></>
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const token = useAuthStore((s) => s.token)
  const logout = useAuthStore((s) => s.logout)
  const isAdmin = useAuthStore((s) => s.isAdmin)
  if (!token || isTokenExpired(token)) {
    if (token) logout()
    return <Navigate to="/login" replace />
  }
  if (!isAdmin) return <Navigate to="/" replace />
  return <>{children}</>
}

export default function App() {
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <BrowserRouter>
          <Suspense fallback={<SplashScreen />}>
            <Routes>
              <Route path="/login" element={<LoginPage />} />
              <Route path="/reset-password" element={<LoginPage />} />
              <Route path="/admin" element={<AdminRoute><AdminPage /></AdminRoute>} />
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
