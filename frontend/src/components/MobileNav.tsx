import { useLocation, useNavigate } from 'react-router-dom'
import { Activity, BarChart2, Home, Upload } from 'lucide-react'

const TABS = [
  { path: '/',            label: 'Global',  icon: Activity },
  { path: '/stats',       label: 'Mensual', icon: BarChart2 },
  { path: '/hogar',       label: 'Hogar',   icon: Home },
  { path: '/importacion', label: 'Importar', icon: Upload },
] as const

/** Barra de navegación inferior, solo en celular (en pantallas grandes se usa la de arriba). */
export default function MobileNav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  return (
    <>
      {/* Espacio para que la barra no tape el final de la página */}
      <div className="h-[calc(5rem+env(safe-area-inset-bottom))] sm:hidden" aria-hidden />
      <nav
        className="mobile-nav sm:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-950/95 backdrop-blur border-t border-slate-800/80 grid grid-cols-4"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        {TABS.map(({ path, label, icon: Icon }) => {
          const active = pathname === path
          return (
            <button
              key={path}
              onClick={() => navigate(path)}
              aria-current={active ? 'page' : undefined}
              className={`flex flex-col items-center gap-1 pt-2.5 pb-2 text-[11px] font-medium transition-colors ${
                active ? 'text-emerald-400' : 'text-slate-500 active:text-slate-300'
              }`}
            >
              <Icon className="w-5 h-5" />
              {label}
            </button>
          )
        })}
      </nav>
    </>
  )
}
