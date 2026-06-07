import { TrendingUp, TrendingDown, Calendar } from 'lucide-react'
import { fmtNum } from './household.utils'

interface Props {
  totalShared: number
  dailyAverage: number
  prevChangePct: number | null
  currency: string
  privacy: boolean
}

function fmt(n: number, privacy: boolean) {
  return privacy ? '••••' : fmtNum(n)
}

export default function HouseholdKPICards({
  totalShared, dailyAverage, prevChangePct, currency, privacy,
}: Props) {
  const isUp   = prevChangePct !== null && prevChangePct > 0
  const isDown = prevChangePct !== null && prevChangePct < 0

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">

      {/* Total gastos */}
      <div className="rounded-2xl border p-4 bg-slate-900 border-slate-800">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">Gastos del mes</p>
        <p className="text-xl font-bold tabular-nums text-slate-100">{fmt(totalShared, privacy)}</p>
        <p className="text-xs text-slate-500 mt-0.5">{currency}</p>
      </div>

      {/* Promedio diario */}
      <div className="rounded-2xl border p-4 bg-slate-900 border-slate-800">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2 flex items-center gap-1">
          <Calendar className="w-3 h-3" />Promedio diario
        </p>
        <p className="text-xl font-bold tabular-nums text-slate-100">{fmt(dailyAverage, privacy)}</p>
        <p className="text-xs text-slate-500 mt-0.5">{currency}/día</p>
      </div>

      {/* vs mes anterior */}
      <div className="rounded-2xl border p-4 bg-slate-900 border-slate-800">
        <p className="text-[10px] uppercase tracking-widest text-slate-500 mb-2">vs mes anterior</p>
        {prevChangePct !== null ? (
          <div className={`flex items-center gap-1.5 ${isUp ? 'text-rose-400' : isDown ? 'text-emerald-400' : 'text-slate-400'}`}>
            {isUp && <TrendingUp className="w-4 h-4" />}
            {isDown && <TrendingDown className="w-4 h-4" />}
            <span className="text-xl font-bold tabular-nums">
              {prevChangePct > 0 ? '+' : ''}{Number(prevChangePct).toFixed(1)}%
            </span>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Sin datos</p>
        )}
        {prevChangePct !== null && (
          <p className="text-[10px] text-slate-600 mt-0.5">
            {isUp ? 'más que el mes anterior' : isDown ? 'menos que el mes anterior' : 'igual al mes anterior'}
          </p>
        )}
      </div>

    </div>
  )
}
