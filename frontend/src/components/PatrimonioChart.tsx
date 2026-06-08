import { useRef, useEffect } from 'react'
import type { MonthlyPatrimonio } from '../api/dashboard'
import useTheme from '../hooks/useTheme'

const MONTH_NAMES: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
}

function fmtCompact(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 10_000)    return `${Math.round(v / 1_000)}K`
  if (abs >= 1_000)     return `${(v / 1_000).toFixed(1)}K`
  return String(Math.round(v))
}

function fmtMoney(n: number, currency = 'UYU', privacy = false) {
  if (privacy) return '****'
  return new Intl.NumberFormat('es-UY', {
    style: 'currency', currency, maximumFractionDigits: 0, currencyDisplay: 'narrowSymbol',
  }).format(n)
}

interface Props {
  data: MonthlyPatrimonio[]
  isLoading?: boolean
  isError?: boolean
  firstTxMonth?: string | null
  privacy: boolean
  currency: string
  netWorth?: number
  netWorthLoading?: boolean
}

export default function PatrimonioChart({
  data,
  isLoading,
  isError,
  firstTxMonth,
  privacy,
  currency,
  netWorth = 0,
  netWorthLoading,
}: Props) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const patChartRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to current month on data load
  useEffect(() => {
    const el = patChartRef.current
    if (!el) return
    el.scrollLeft = el.scrollWidth
  }, [data])

  return (
    <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl sm:rounded-3xl p-4 sm:p-6">

      {/* Patrimonio bar chart */}
      {isLoading ? (
        <div className="h-48 bg-slate-800/50 animate-pulse rounded-xl mb-5" />
      ) : isError ? (
        <div className="h-36 flex items-center justify-center mb-5">
          <p className="text-xs text-rose-400">Error al cargar patrimonio</p>
        </div>
      ) : (() => {
        const firstMonth = firstTxMonth ?? ''
        const bars = data.filter(p => p.value !== null && (!firstMonth || p.month >= firstMonth))
        if (bars.length === 0) return (
          <div className="h-36 flex items-center justify-center mb-5">
            <p className="text-xs text-slate-500">Sin datos de patrimonio ({data.length} meses, todos nulos)</p>
          </div>
        )

        const todayLabel = new Date().toISOString().slice(0, 7)

        const rawMax    = Math.max(...bars.map(p => p.value!), 0)
        const rawMin    = Math.min(...bars.map(p => p.value!), 0)
        const range     = rawMax - rawMin || 1

        const BAR_W      = 26
        const COL_W      = 46
        const GAP        = 10
        const LABEL_H    = 34
        const TOP_PAD    = 28
        const BAR_AREA_H = 180
        const MAX_VIEW_H = 260
        const INNER_H    = TOP_PAD + BAR_AREA_H

        const posFrac = rawMax / range

        const barPx = (v: number) =>
          Math.max(Math.round((Math.abs(v) / range) * BAR_AREA_H), v !== 0 ? 4 : 0)

        const zeroTopPx = TOP_PAD + Math.round(posFrac * BAR_AREA_H)

        // subtle guide lines at 33% and 66% of positive zone
        const guideLines = rawMax > 0 ? [0.33, 0.66] : []

        return (
          <div
            ref={patChartRef}
            className="overflow-x-auto overflow-y-auto mb-5"
            style={{
              maxHeight: MAX_VIEW_H,
              scrollbarWidth: 'thin',
              scrollbarColor: isLight ? '#cbd5e1 transparent' : '#334155 transparent',
            }}
          >
            <div style={{ minWidth: bars.length * (COL_W + GAP) + 16 }}>

              {/* Bar area */}
              <div
                className="relative flex px-2"
                style={{ height: INNER_H, gap: GAP }}
              >
                {/* Guide lines */}
                {guideLines.map(frac => (
                  <div
                    key={frac}
                    className="absolute left-0 right-0 pointer-events-none"
                    style={{
                      top: TOP_PAD + Math.round(posFrac * BAR_AREA_H * (1 - frac)),
                      height: 1,
                      background: isLight
                        ? 'rgba(203,213,225,0.4)'
                        : 'rgba(51,65,85,0.25)',
                    }}
                  />
                ))}

                {/* Zero-line */}
                <div
                  className="absolute left-0 right-0 pointer-events-none"
                  style={{
                    top: zeroTopPx,
                    height: 1,
                    background: isLight ? 'rgba(148,163,184,0.7)' : 'rgba(71,85,105,0.8)',
                  }}
                />

                {bars.map(p => {
                  const isNow = p.month === todayLabel
                  const isPos = p.value! >= 0
                  const bH    = barPx(p.value!)

                  return (
                    <div
                      key={p.month}
                      className="relative flex-none group"
                      style={{ width: COL_W, height: INNER_H }}
                    >
                      {/* Value label — only shown when bar has height */}
                      {bH > 0 && (
                        <span
                          className="absolute left-0 right-0 text-center tabular-nums leading-none pointer-events-none text-white"
                          style={{
                            top: isPos ? zeroTopPx - bH - 18 : zeroTopPx + bH + 4,
                            fontSize: 10,
                            fontWeight: 500,
                            letterSpacing: '-0.02em',
                          }}
                        >
                          {privacy ? '·····' : fmtCompact(p.value!)}
                        </span>
                      )}

                      {/* Bar — only shown when value is non-zero */}
                      {bH > 0 && (
                      <div
                        className={`absolute overflow-hidden transition-all duration-150 group-hover:brightness-110 ${isPos ? 'rounded-t-md' : 'rounded-b-md'}`}
                        style={{
                          left: '50%',
                          transform: 'translateX(-50%)',
                          width: BAR_W,
                          height: bH,
                          top: isPos ? zeroTopPx - bH : zeroTopPx,
                          background: isPos
                            ? (isLight
                              ? 'linear-gradient(to top, #0284c7, #38bdf8)'
                              : 'linear-gradient(to top, #0891b2, #22d3ee)')
                            : (isLight
                              ? 'linear-gradient(to bottom, #be123c, #fb7185)'
                              : 'linear-gradient(to bottom, #e11d48, #fb7185)'),
                          boxShadow: isPos
                            ? (isLight ? '0 2px 8px rgba(2,132,199,0.25)' : '0 2px 10px rgba(8,145,178,0.35)')
                            : (isLight ? '0 2px 8px rgba(190,18,60,0.25)' : '0 2px 10px rgba(225,29,72,0.35)'),
                        }}
                      >
                        {/* Inner gloss highlight */}
                        <div
                          className="absolute inset-y-0 left-0 pointer-events-none"
                          style={{
                            width: '40%',
                            background: 'linear-gradient(to right, rgba(255,255,255,0.18), transparent)',
                          }}
                        />
                      </div>
                      )}

                      {/* Current month dot indicator */}
                      {isNow && (
                        <div
                          className="absolute left-1/2 -translate-x-1/2 rounded-full"
                          style={{
                            width: 4,
                            height: 4,
                            bottom: 6,
                            background: isPos ? '#22d3ee' : '#fb7185',
                            boxShadow: isPos ? '0 0 6px #22d3ee' : '0 0 6px #fb7185',
                          }}
                        />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Month labels — sticky */}
              <div
                className="sticky bottom-0 flex px-2 bg-slate-900 border-t border-slate-800/50"
                style={{ gap: GAP, height: LABEL_H }}
              >
                {bars.map(p => {
                  const isNow = p.month === todayLabel
                  const [yr, mo] = p.month.split('-')
                  return (
                    <div
                      key={p.month}
                      className="flex-none flex flex-col items-center justify-center gap-0.5"
                      style={{ width: COL_W }}
                    >
                      <span
                        className={`leading-none tabular-nums ${isNow ? 'text-cyan-400 font-semibold' : 'text-slate-500'}`}
                        style={{ fontSize: 10 }}
                      >
                        {MONTH_NAMES[mo] ?? mo}
                      </span>
                      <span
                        className="leading-none tabular-nums text-slate-600"
                        style={{ fontSize: 9 }}
                      >
                        {yr.slice(2)}
                      </span>
                    </div>
                  )
                })}
              </div>

            </div>
          </div>
        )
      })()}

      {/* Total + % vs mes anterior */}
      {(() => {
        const todayLabel = new Date().toISOString().slice(0, 7)
        const validPat   = data.filter(p => p.value !== null)
        const curIdx     = validPat.findIndex(p => p.month === todayLabel)
        const prevPat    = curIdx > 0 ? validPat[curIdx - 1] : null
        const pctChange  = prevPat && prevPat.value !== 0
          ? ((netWorth - prevPat.value!) / Math.abs(prevPat.value!)) * 100
          : null
        return (
          <div>
            <p className="text-[10px] text-slate-500 uppercase font-bold tracking-widest mb-1">
              Patrimonio Neto Total
            </p>
            <div className="flex items-center justify-between gap-2">
              <div>
                <span className="text-2xl font-bold text-white tabular-nums">
                  {netWorthLoading ? '…' : fmtMoney(netWorth, currency, privacy)}
                </span>
                <span className="text-xs text-slate-500 ml-1.5">{currency}</span>
              </div>
              {pctChange !== null && (
                <span className={`text-[11px] font-semibold px-2 py-1 rounded-full shrink-0 ${
                  pctChange >= 0 ? 'bg-emerald-500/15 text-emerald-400' : 'bg-rose-500/15 text-rose-400'
                }`}>
                  {pctChange >= 0 ? '↗' : '↘'} {Math.abs(pctChange).toFixed(1)}%
                </span>
              )}
            </div>
          </div>
        )
      })()}

    </div>
  )
}
