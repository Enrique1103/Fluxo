import { TrendingUp, TrendingDown, Calendar } from 'lucide-react'
import { fmtNum } from './household.utils'

interface Props {
  totalShared: number
  dailyAverage: number
  prevChangePct: number | null
  currency: string
  privacy: boolean
  isLoading?: boolean
}

function fmt(n: number, currency: string, privacy: boolean) {
  if (privacy) return '••••'
  return new Intl.NumberFormat('es-UY', {
    style: 'currency', currency, maximumFractionDigits: 0, currencyDisplay: 'narrowSymbol',
  }).format(n)
}

export default function HouseholdKPICards({
  totalShared, dailyAverage, prevChangePct, currency, privacy, isLoading = false,
}: Props) {
  const pct      = prevChangePct ?? 0
  const isUp     = prevChangePct !== null && pct > 0
  const isDown   = prevChangePct !== null && pct < 0
  const hasDelta = prevChangePct !== null

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">

      {/* Gastos del mes */}
      <div className="relative bg-slate-900/40 border border-rose-500/25 rounded-2xl p-4 backdrop-blur-sm overflow-hidden flex flex-col gap-3">
        <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-rose-500/10 opacity-40 blur-2xl pointer-events-none" />
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Gastos del mes</p>
          <div className="w-8 h-8 bg-rose-500/10 rounded-lg flex items-center justify-center">
            <TrendingDown className="w-4 h-4 text-rose-400" />
          </div>
        </div>
        {isLoading ? (
          <div className="h-9 w-28 bg-slate-800 animate-pulse rounded-lg" />
        ) : (
          <p className="text-3xl font-bold tabular-nums leading-none text-rose-400">
            {fmt(totalShared, currency, privacy)}
          </p>
        )}
        <div className="h-5" />
      </div>

      {/* Gasto Diario Promedio */}
      <div className="relative bg-slate-900/40 border border-amber-500/25 rounded-2xl p-4 backdrop-blur-sm overflow-hidden flex flex-col gap-3">
        <div className="absolute -top-4 -right-4 w-20 h-20 rounded-full bg-amber-500/10 opacity-40 blur-2xl pointer-events-none" />
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">Gasto Diario Promedio</p>
          <div className="w-8 h-8 bg-amber-500/10 rounded-lg flex items-center justify-center">
            <Calendar className="w-4 h-4 text-amber-400" />
          </div>
        </div>
        {isLoading ? (
          <div className="h-9 w-28 bg-slate-800 animate-pulse rounded-lg" />
        ) : (
          <p className="text-3xl font-bold tabular-nums leading-none text-amber-400">
            {privacy ? '••••' : `${fmtNum(dailyAverage)}/día`}
          </p>
        )}
        <div className="h-5" />
      </div>

      {/* vs Mes Anterior */}
      <div className={`relative bg-slate-900/40 border rounded-2xl p-4 backdrop-blur-sm overflow-hidden flex flex-col gap-3 ${
        isUp ? 'border-rose-500/25' : isDown ? 'border-emerald-500/25' : 'border-slate-700/40'
      }`}>
        <div className={`absolute -top-4 -right-4 w-20 h-20 rounded-full opacity-40 blur-2xl pointer-events-none ${
          isUp ? 'bg-rose-500/10' : isDown ? 'bg-emerald-500/10' : 'bg-slate-500/10'
        }`} />
        <div className="flex items-center justify-between">
          <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest">vs Mes Anterior</p>
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${
            isUp ? 'bg-rose-500/10' : isDown ? 'bg-emerald-500/10' : 'bg-slate-800'
          }`}>
            {isUp
              ? <TrendingUp   className="w-4 h-4 text-rose-400"    />
              : isDown
              ? <TrendingDown className="w-4 h-4 text-emerald-400" />
              : <TrendingDown className="w-4 h-4 text-slate-500"   />
            }
          </div>
        </div>
        {isLoading ? (
          <div className="h-9 w-28 bg-slate-800 animate-pulse rounded-lg" />
        ) : hasDelta ? (
          <p className={`text-3xl font-bold tabular-nums leading-none ${
            isUp ? 'text-rose-400' : isDown ? 'text-emerald-400' : 'text-slate-400'
          }`}>
            {privacy ? '**%' : `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%`}
          </p>
        ) : (
          <p className="text-3xl font-bold tabular-nums leading-none text-slate-600">—</p>
        )}
        <div className="h-5" />
      </div>

    </div>
  )
}
