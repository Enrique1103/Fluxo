import { useLocation, useNavigate } from 'react-router-dom'
import { Activity, BarChart2, Home, Upload } from 'lucide-react'

const TABS = [
  { path: '/',            label: 'Global',   icon: Activity },
  { path: '/stats',       label: 'Mensual',  icon: BarChart2 },
  { path: '/hogar',       label: 'Hogar',    icon: Home },
  { path: '/importacion', label: 'Importar', icon: Upload },
] as const

/** Barra de navegación inferior, solo en celular (en pantallas grandes se usa la de arriba).
 *  Estilo de app nativa: la pestaña activa lleva una "píldora" detrás del ícono. */
export default function MobileNav() {
  const { pathname } = useLocation()
  const navigate = useNavigate()

  return (
    <>
      {/* Espacio para que la barra no tape el final de la página */}
      <div className="h-[calc(4.5rem+env(safe-area-inset-bottom))] sm:hidden" aria-hidden />
      <nav
        aria-label="Navegación principal"
        className="mobile-nav sm:hidden fixed bottom-0 inset-x-0 z-40 bg-slate-950/85 backdrop-blur-xl backdrop-saturate-150 border-t border-white/[0.06] shadow-[0_-8px_24px_rgba(0,0,0,0.35)]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="grid grid-cols-4 h-16 max-w-md mx-auto">
          {TABS.map(({ path, label, icon: Icon }) => {
            const active = pathname === path
            return (
              <button
                key={path}
                onClick={() => { if (!active) navigate(path) }}
                aria-current={active ? 'page' : undefined}
                className="group flex flex-col items-center justify-center gap-1"
              >
                <span className={`nav-pill flex items-center justify-center w-14 h-8 rounded-full transition-all duration-200 ${
                  active ? 'bg-emerald-500/15 text-emerald-400' : 'text-slate-400 group-active:bg-white/5'
                }`}>
                  <Icon className="w-[22px] h-[22px]" strokeWidth={active ? 2.25 : 1.75} />
                </span>
                <span className={`nav-label text-[11px] leading-none tracking-wide ${
                  active ? 'text-emerald-400 font-semibold' : 'text-slate-500 font-medium'
                }`}>
                  {label}
                </span>
              </button>
            )
          })}
        </div>
      </nav>
    </>
  )
}
