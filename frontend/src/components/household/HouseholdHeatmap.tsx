import { fmtNum } from './household.utils'

interface Props {
  expensesByDay: Record<string, number>
  year: number
  month: number
  currency: string
  privacy: boolean
}

const WEEK_DAYS = ['D', 'L', 'M', 'X', 'J', 'V', 'S']

function intensityClass(amount: number, max: number): string {
  if (amount <= 0) return 'bg-slate-800/50'
  const pct = amount / max
  if (pct < 0.2) return 'bg-indigo-900/60'
  if (pct < 0.4) return 'bg-indigo-800/70'
  if (pct < 0.6) return 'bg-indigo-700/80'
  if (pct < 0.8) return 'bg-indigo-600'
  return 'bg-indigo-500'
}

export default function HouseholdHeatmap({ expensesByDay, year, month, currency, privacy }: Props) {
  const firstWeekday = new Date(year, month - 1, 1).getDay()
  const daysInMonth  = new Date(year, month, 0).getDate()
  const maxAmount    = Math.max(...Object.values(expensesByDay), 1)

  const cells: Array<number | null> = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ]
  while (cells.length % 7 !== 0) cells.push(null)

  return (
    <div className="rounded-3xl border overflow-hidden bg-slate-900 border-slate-800">
      <div className="px-5 py-4 border-b border-slate-800">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Actividad del mes</p>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-7 gap-1 mb-2">
          {WEEK_DAYS.map(d => (
            <div key={d} className="text-center text-[9px] text-slate-600 font-medium select-none">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((day, i) => {
            if (day === null) return <div key={`empty-${i}`} className="aspect-square" />
            const amount    = expensesByDay[String(day)] ?? 0
            const hasExpense = amount > 0
            return (
              <div
                key={day}
                className={`aspect-square rounded-md flex items-center justify-center relative group cursor-default transition-opacity hover:opacity-80 ${intensityClass(amount, maxAmount)}`}
              >
                <span className={`text-[10px] font-medium select-none ${hasExpense ? 'text-white' : 'text-slate-600'}`}>
                  {day}
                </span>
                {hasExpense && (
                  <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 z-20 pointer-events-none hidden group-hover:block">
                    <div className="bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-[10px] whitespace-nowrap text-slate-200 shadow-xl">
                      {privacy ? '••••' : fmtNum(amount)} {currency}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
        <div className="flex items-center justify-end gap-1.5 mt-3">
          <span className="text-[9px] text-slate-600 mr-1">Menor</span>
          {(['bg-slate-800/50', 'bg-indigo-900/60', 'bg-indigo-700/80', 'bg-indigo-600', 'bg-indigo-500'] as const).map((c, i) => (
            <div key={i} className={`w-3.5 h-3.5 rounded-sm ${c}`} />
          ))}
          <span className="text-[9px] text-slate-600 ml-1">Mayor</span>
        </div>
      </div>
    </div>
  )
}
