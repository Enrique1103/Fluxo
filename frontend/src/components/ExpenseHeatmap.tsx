import { useMemo } from 'react'

export default function ExpenseHeatmap({
  year, month, dailyExpenses, privacy,
}: {
  year: number
  month: number
  dailyExpenses: { date: string; total: number }[]
  privacy: boolean
}) {
  const dayMap = useMemo(() => {
    const m: Record<string, number> = {}
    for (const d of dailyExpenses) m[d.date] = d.total
    return m
  }, [dailyExpenses])

  const maxExp = useMemo(
    () => Math.max(...dailyExpenses.map(d => d.total), 1),
    [dailyExpenses]
  )

  const firstDay = new Date(year, month - 1, 1)
  const lastDay  = new Date(year, month, 0).getDate()
  const startDow = (firstDay.getDay() + 6) % 7

  const cells: { day: number | null; date: string | null }[] = []
  for (let i = 0; i < startDow; i++) cells.push({ day: null, date: null })
  for (let d = 1; d <= lastDay; d++) {
    const mm = String(month).padStart(2, '0')
    const dd = String(d).padStart(2, '0')
    cells.push({ day: d, date: `${year}-${mm}-${dd}` })
  }

  const DOW = ['L','M','X','J','V','S','D']

  const heatColor = (intensity: number): string => {
    if (intensity <= 0) return 'rgba(255,255,255,0.03)'
    const stops: [number, [number,number,number]][] = [
      [0.00, [251, 191,  36]],
      [0.25, [251, 146,  60]],
      [0.50, [251, 113, 133]],
      [0.75, [244,  63,  94]],
      [1.00, [159,  18,  57]],
    ]
    const t = Math.max(0, Math.min(1, intensity))
    let lo = stops[0], hi = stops[stops.length - 1]
    for (let i = 0; i < stops.length - 1; i++) {
      if (t >= stops[i][0] && t <= stops[i + 1][0]) { lo = stops[i]; hi = stops[i + 1]; break }
    }
    const span = hi[0] - lo[0]
    const f = span > 0 ? (t - lo[0]) / span : 0
    const r = Math.round(lo[1][0] + (hi[1][0] - lo[1][0]) * f)
    const g = Math.round(lo[1][1] + (hi[1][1] - lo[1][1]) * f)
    const b = Math.round(lo[1][2] + (hi[1][2] - lo[1][2]) * f)
    return `rgb(${r},${g},${b})`
  }

  return (
    <div className="select-none">
      <div className="grid grid-cols-7 mb-1">
        {DOW.map(d => (
          <div key={d} className="text-center text-sm font-bold text-slate-600 py-1">{d}</div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {cells.map((cell, i) => {
          if (!cell.day || !cell.date) {
            return <div key={i} />
          }
          const exp = dayMap[cell.date] ?? 0
          const intensity = exp > 0 ? 0.1 + (exp / maxExp) * 0.9 : 0

          const today = new Date()
          const isToday =
            today.getFullYear() === year &&
            today.getMonth() + 1 === month &&
            today.getDate() === cell.day

          return (
            <div
              key={cell.date}
              title={exp > 0 && !privacy ? `${cell.date}: $${exp.toFixed(0)}` : cell.date ?? ''}
              className="relative aspect-square rounded-md flex flex-col items-center justify-center cursor-default"
              style={{ background: heatColor(intensity), outline: isToday ? '1.5px solid #34d399' : undefined }}
            >
              <span className={`text-xs font-medium ${
                exp > 0 ? 'text-white' : 'text-slate-600'
              } ${isToday ? 'text-emerald-400' : ''}`}>
                {cell.day}
              </span>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-2 mt-3 justify-end">
        <span className="text-sm text-slate-600">Menos</span>
        {[0.1, 0.325, 0.55, 0.775, 1.0].map(v => (
          <div key={v} className="w-4 h-4 rounded-sm" style={{ background: heatColor(v) }} />
        ))}
        <span className="text-sm text-slate-600">Más</span>
      </div>
    </div>
  )
}
