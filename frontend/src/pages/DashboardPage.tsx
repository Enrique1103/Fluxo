import { useState, useMemo, useRef, useEffect, useCallback, type ReactElement } from 'react'
import useTheme from '../hooks/useTheme'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Settings, Eye, EyeOff,
  Activity, DollarSign,
  Lock, LockOpen, BarChart2,
  Edit3, Trash2, Plus, Loader2,
  CreditCard, Wallet, TrendingUp, Upload, Home,
  Users, ArrowRight,
} from 'lucide-react'
import {
  fetchIncomeVsExpenses,
  fetchSummary,
  fetchFinGoals,
  fetchMe,
  updateFinGoalAllocation,
  deleteFinGoal,
  fetchPatrimonio,
  fetchExchangeRates,
  type MonthlyStat,
  type FinGoal,
  type MonthlyPatrimonio,
  type ExchangeRate,
} from '../api/dashboard'
import SettingsDrawer, { type Section as SettingsSection } from '../components/SettingsDrawer'
import GoalModal from '../components/GoalModal'
import ConfirmDialog from '../components/ConfirmDialog'
import TransactionModal from '../components/TransactionModal'

// ─── helpers ────────────────────────────────────────────────────────────────

const MONTH_NAMES: Record<string, string> = {
  '01': 'Ene', '02': 'Feb', '03': 'Mar', '04': 'Abr',
  '05': 'May', '06': 'Jun', '07': 'Jul', '08': 'Ago',
  '09': 'Sep', '10': 'Oct', '11': 'Nov', '12': 'Dic',
}

function fmtMonth(iso: string) {
  // "2025-03" → "Mar 25"
  const [year, m] = iso.split('-')
  return `${MONTH_NAMES[m] ?? m} ${year.slice(2)}`
}

function fmtCompact(v: number): string {
  const abs = Math.abs(v)
  if (abs >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`
  if (abs >= 10_000)    return `${Math.round(v / 1_000)}K`
  if (abs >= 1_000)     return `${(v / 1_000).toFixed(1)}K`
  return String(Math.round(v))
}

function fmtDuration(months: number): string {
  if (months <= 0)         return '¡Ya alcanzado!'
  if (!isFinite(months) || months > 600) return 'más de 50 años'
  const y = Math.floor(months / 12)
  const m = Math.round(months % 12)
  if (y === 0) return `~${m} mes${m !== 1 ? 'es' : ''}`
  if (m === 0) return `~${y} año${y !== 1 ? 's' : ''}`
  return `~${y} año${y !== 1 ? 's' : ''} y ${m} mes${m !== 1 ? 'es' : ''}`
}

function fmtMoney(n: number, currency = 'UYU', privacy = false) {
  if (privacy) return '****'
  return new Intl.NumberFormat('es-UY', {
    style: 'currency', currency, maximumFractionDigits: 0, currencyDisplay: 'narrowSymbol',
  }).format(n)
}


function goalColor(idx: number) {
  const colors = ['bg-cyan-400', 'bg-emerald-400', 'bg-indigo-400', 'bg-amber-400', 'bg-rose-400']
  return colors[idx % colors.length]
}

// ─── Chart empty-state wave canvas ──────────────────────────────────────────

function ChartWaveCanvas() {
  const canvasRef    = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const wrap   = containerRef.current
    if (!canvas || !wrap) return
    const ctx = canvas.getContext('2d')!

    let W = wrap.clientWidth
    let H = wrap.clientHeight
    canvas.width  = W
    canvas.height = H

    let t = 0
    let raf: number
    const N   = 160
    const PL  = 38   // left pad (y-axis labels)
    const PB  = 26   // bottom pad (x-axis labels)
    const PT  = 14   // top pad

    const ro = new ResizeObserver(() => {
      W = wrap.clientWidth; H = wrap.clientHeight
      canvas.width = W; canvas.height = H
    })
    ro.observe(wrap)

    // Wave Y at column i
    const getY = (i: number, baseR: number, spd: number, amp: number) => {
      const base = H * baseR + PT - (i / N) * (H * 0.10)
      return base
        + Math.sin(i * 0.07  + t * spd)          * amp
        + Math.cos(i * 0.04  - t * spd * 0.65)   * (amp * 1.3)
        + Math.sin(i * 0.15  + t * spd * 1.2)    * (amp * 0.35)
        + Math.cos(i * 0.025 + t * spd * 0.40)   * (amp * 0.55)
    }

    const buildPts = (baseR: number, spd: number, amp: number) => {
      const pts: { x: number; y: number }[] = []
      for (let i = 0; i <= N; i++) {
        pts.push({ x: PL + (i / N) * (W - PL), y: getY(i, baseR, spd, amp) })
      }
      return pts
    }

    // Full glow-stack wave + area fill
    const drawWave = (
      pts:    { x: number; y: number }[],
      rgb:    string,   // '34,211,238'
      dashed: boolean,
    ) => {
      const path = () => {
        ctx.beginPath()
        pts.forEach((p, i) => i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y))
      }

      // Area fill — gradient from color to transparent
      const areaGrad = ctx.createLinearGradient(0, PT, 0, H - PB)
      areaGrad.addColorStop(0,    `rgba(${rgb},0.16)`)
      areaGrad.addColorStop(0.55, `rgba(${rgb},0.05)`)
      areaGrad.addColorStop(1,    `rgba(${rgb},0)`)
      path()
      ctx.lineTo(pts[pts.length - 1].x, H - PB)
      ctx.lineTo(pts[0].x, H - PB)
      ctx.closePath()
      ctx.fillStyle = areaGrad
      ctx.fill()

      if (dashed) ctx.setLineDash([7, 4])

      // Pass 1 — outer halo
      ctx.save()
      ctx.shadowColor = `rgba(${rgb},0.45)`
      ctx.shadowBlur  = 32
      path()
      ctx.strokeStyle = `rgba(${rgb},0.05)`
      ctx.lineWidth   = 18
      ctx.stroke()
      ctx.restore()

      // Pass 2 — mid glow
      ctx.save()
      ctx.shadowColor = `rgba(${rgb},0.7)`
      ctx.shadowBlur  = 12
      path()
      ctx.strokeStyle = `rgba(${rgb},0.22)`
      ctx.lineWidth   = 4
      ctx.stroke()
      ctx.restore()

      // Pass 3 — crisp line
      ctx.save()
      ctx.shadowColor = `rgba(${rgb},1)`
      ctx.shadowBlur  = 4
      path()
      ctx.strokeStyle = `rgba(${rgb},0.88)`
      ctx.lineWidth   = 1.5
      ctx.stroke()
      ctx.restore()

      ctx.setLineDash([])
    }

    // Pulsing dot at right end of wave (phase-offset per line)
    const drawDot = (p: { x: number; y: number }, rgb: string, phase: number) => {
      const pulse = Math.sin(t * 2.8 + phase) * 0.5 + 0.5
      const r     = 3 + pulse * 2.2
      const ring  = r + 4 + pulse * 8

      // Outer ring
      ctx.save()
      ctx.shadowColor = `rgba(${rgb},0.5)`
      ctx.shadowBlur  = 16
      ctx.beginPath()
      ctx.arc(p.x, p.y, ring, 0, Math.PI * 2)
      ctx.strokeStyle = `rgba(${rgb},${0.10 + pulse * 0.20})`
      ctx.lineWidth   = 1
      ctx.stroke()
      ctx.restore()

      // Core
      ctx.save()
      ctx.shadowColor = `rgba(${rgb},1)`
      ctx.shadowBlur  = 10
      ctx.beginPath()
      ctx.arc(p.x, p.y, r, 0, Math.PI * 2)
      ctx.fillStyle = `rgba(${rgb},1)`
      ctx.fill()
      ctx.restore()
    }

    const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
    const now    = new Date()
    const chartW = () => W - PL
    const chartH = () => H - PB - PT

    const render = () => {
      ctx.clearRect(0, 0, W, H)
      const cW = chartW()
      const cH = chartH()

      // ── Grid ──────────────────────────────────────────────────────────────
      ctx.save()
      ctx.font      = '9px "Inter", system-ui, sans-serif'
      ctx.textAlign = 'right'
      for (let g = 0; g <= 4; g++) {
        const y = PT + (g / 4) * cH
        ctx.beginPath()
        ctx.moveTo(PL, y); ctx.lineTo(W, y)
        ctx.strokeStyle = g === 0 || g === 4 ? 'rgba(148,163,184,0.07)' : 'rgba(148,163,184,0.04)'
        ctx.lineWidth   = 1
        if (g > 0 && g < 4) ctx.setLineDash([3, 7])
        ctx.stroke()
        ctx.setLineDash([])
        ctx.fillStyle = 'rgba(100,116,139,0.45)'
        ctx.fillText(`${(1 - g / 4) * 100 | 0}k`, PL - 5, y + 3)
      }

      // X-axis: month labels
      const numM  = Math.min(7, Math.floor(cW / 68))
      ctx.textAlign = 'center'
      for (let m = 0; m <= numM; m++) {
        const x    = PL + (m / numM) * cW
        const mIdx = ((now.getMonth() - numM + m) % 12 + 12) % 12
        ctx.fillStyle = 'rgba(100,116,139,0.40)'
        ctx.fillText(MONTHS[mIdx], x, H - 7)
        ctx.beginPath()
        ctx.moveTo(x, H - PB); ctx.lineTo(x, H - PB + 3)
        ctx.strokeStyle = 'rgba(100,116,139,0.18)'
        ctx.lineWidth   = 1
        ctx.stroke()
      }
      ctx.restore()

      // ── Ambient glow pulse ──────────────────────────────────────────────
      const pulse = Math.sin(t * 0.4) * 0.5 + 0.5
      const rg = ctx.createRadialGradient(W * 0.5, H * 0.45, 0, W * 0.5, H * 0.45, W * 0.55)
      rg.addColorStop(0,   `rgba(52,211,153,${0.025 + pulse * 0.018})`)
      rg.addColorStop(0.5, `rgba(34,211,238,${0.015 + pulse * 0.010})`)
      rg.addColorStop(1,   'rgba(0,0,0,0)')
      ctx.fillStyle = rg
      ctx.fillRect(PL, PT, cW, cH)

      // ── Scanning line ──────────────────────────────────────────────────
      const scanX = PL + ((t * 18) % (cW + 90)) - 45
      if (scanX > PL && scanX < W) {
        const sg = ctx.createLinearGradient(scanX - 50, 0, scanX + 50, 0)
        sg.addColorStop(0,   'rgba(255,255,255,0)')
        sg.addColorStop(0.45,'rgba(255,255,255,0.018)')
        sg.addColorStop(0.5, 'rgba(255,255,255,0.065)')
        sg.addColorStop(0.55,'rgba(255,255,255,0.018)')
        sg.addColorStop(1,   'rgba(255,255,255,0)')
        ctx.fillStyle = sg
        ctx.fillRect(scanX - 50, PT, 100, cH)

        ctx.save()
        ctx.shadowColor = 'rgba(255,255,255,0.5)'
        ctx.shadowBlur  = 5
        ctx.beginPath()
        ctx.moveTo(scanX, PT); ctx.lineTo(scanX, H - PB)
        ctx.strokeStyle = 'rgba(255,255,255,0.09)'
        ctx.lineWidth   = 0.5
        ctx.stroke()
        ctx.restore()
      }

      // ── Waves (back → front) ───────────────────────────────────────────
      const gasPts = buildPts(0.60, 0.42, 18)
      const ahrPts = buildPts(0.44, 0.33, 21)
      const ingPts = buildPts(0.28, 0.38, 25)

      drawWave(gasPts, '244,63,94',  true)
      drawWave(ahrPts, '52,211,153', false)
      drawWave(ingPts, '34,211,238', false)

      // Pulsing dots — staggered phases (2π/3 apart)
      drawDot(ingPts[N], '34,211,238',  0)
      drawDot(ahrPts[N], '52,211,153',  2.09)
      drawDot(gasPts[N], '244,63,94',   4.19)

      t += 0.013
      raf = requestAnimationFrame(render)
    }

    render()
    return () => { cancelAnimationFrame(raf); ro.disconnect() }
  }, [])

  return (
    <div ref={containerRef} className="w-full" style={{ height: 220 }}>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  )
}

// chart colors
const ING_COLOR = '#34d399'
const GAS_COLOR = '#fb7185'
const AHR_COLOR = '#38bdf8'

// Y-axis nice step
function niceStep(maxVal: number, numTicks: number): number {
  const rough = maxVal / numTicks
  const mag   = Math.pow(10, Math.floor(Math.log10(rough)))
  const norm  = rough / mag
  if (norm <= 1) return mag
  if (norm <= 2) return 2 * mag
  if (norm <= 5) return 5 * mag
  return 10 * mag
}

const CHART_H_BASE = 290
const PT = 14, PB = 28
const YAXIS_W   = 52   // left — flujo mensual
const YAXIS_R_W = 52   // right — patrimonio
const COL_W_MIN = 60
const COL_W_MAX = 160
const COL_W_STEP = 20

function MonthlyChart({
  data,
  patrimonio,
  privacy,
  currency,
  onLoadMore,
}: {
  data: MonthlyStat[]
  patrimonio: MonthlyPatrimonio[]
  privacy: boolean
  currency: string
  onLoadMore?: () => void
}) {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const scrollRef      = useRef<HTMLDivElement>(null)
  const sentinelRef    = useRef<HTMLDivElement>(null)
  const [hIdx, setHIdx]           = useState<number | null>(null)
  const [scrollLeft, setScrollLeft] = useState(0)
  const [visibleW,   setVisibleW]   = useState(600)
  const [colW,  setColW]  = useState(84)
  const [fitY,  setFitY]  = useState(false)

  const D          = data
  const n          = D.length
  const todayMonth = new Date().toISOString().slice(0, 7)
  const totalW     = n * colW
  // Chart height grows with zoom: +1px of height per 1px of extra column width
  const chartH     = CHART_H_BASE + (colW - 84)
  const innerH     = chartH - PT - PB
  const baseline   = PT + innerH

  // Y scale
  const lastDataIdx = D.reduce((acc, d, i) => (d.ingresos > 0 || d.gastos > 0 ? i : acc), -1)
  const dataEnd     = lastDataIdx >= 0 ? lastDataIdx + 1 : D.length
  const visibleStats = D.slice(0, dataEnd).filter(d => d.ingresos > 0 || d.gastos > 0)

  const rawMax = fitY && visibleStats.length > 0
    ? Math.max(...visibleStats.flatMap(d => [d.ingresos, d.gastos])) * 1.06
    : Math.max(...D.flatMap(d => [d.ingresos, d.gastos, d.ahorro]), 1) * 1.15
  const rawMin = fitY && visibleStats.length > 0
    ? Math.min(...visibleStats.flatMap(d => [d.ingresos, d.gastos])) * 0.94
    : Math.min(...D.map(d => d.ahorro), 0)
  const step    = niceStep(rawMax, 4)
  const tickMax = Math.ceil(rawMax / step) * step
  const tickMin = rawMin < 0 ? Math.floor(rawMin / step) * step : 0
  const range   = tickMax - tickMin || 1
  const ticks   = Array.from(
    { length: Math.round((tickMax - tickMin) / step) + 1 },
    (_, i) => tickMin + i * step,
  )

  const xOf    = (i: number) => i * colW + colW / 2
  const yOfRaw = (v: number) => PT + (1 - (v - tickMin) / range) * innerH
  const zeroY  = yOfRaw(0)
  // Garantiza que cualquier valor ≠ 0 quede al menos MIN_VIS_PX del eje cero,
  // así los montos pequeños (cuotas, etc.) siempre son visibles en el gráfico.
  const MIN_VIS_PX = 4
  const yOf = (v: number) => {
    const raw = yOfRaw(v)
    if (v === 0) return raw
    if (v > 0 && raw > zeroY - MIN_VIS_PX) return zeroY - MIN_VIS_PX
    if (v < 0 && raw < zeroY + MIN_VIS_PX) return zeroY + MIN_VIS_PX
    return raw
  }

  // Currency prefix for Y-axis
  const currPrefix = currency === 'EUR' ? '€' : '$'
  const fmtTick = (v: number) => {
    const abs = Math.abs(v)
    const sign = v < 0 ? '-' : ''
    if (abs === 0) return `${currPrefix}0`
    if (abs >= 1000) return `${sign}${currPrefix}${(abs / 1000) % 1 === 0 ? abs / 1000 : (abs / 1000).toFixed(1)}k`
    return `${sign}${currPrefix}${abs}`
  }

  // ── Patrimonio Y-scale (right axis, independent) ──────────────────────────
  // Build a map from month label → patrimonio value for quick lookup
  const patMap = new Map(patrimonio.map(p => [p.month, p]))

  const patValues = D.map(d => patMap.get(d.month)?.value ?? null)
  const validPat  = patValues.filter((v): v is number => v !== null)
  const patMax    = validPat.length ? Math.max(...validPat) * 1.1 : 1
  const patMin    = validPat.length ? Math.min(...validPat, 0)     : 0
  const patStep   = niceStep(Math.max(patMax - patMin, 1), 4)
  const patTickMax = Math.ceil(patMax  / patStep) * patStep
  const patTickMin = Math.floor(patMin / patStep) * patStep
  const patRange   = patTickMax - patTickMin || 1
  const patTicks   = Array.from(
    { length: Math.round((patTickMax - patTickMin) / patStep) + 1 },
    (_, i) => patTickMin + i * patStep,
  )
  const yPat = (v: number) => PT + (1 - (v - patTickMin) / patRange) * innerH

  // Smooth bezier path
  const linePath = (pts: { x: number; y: number }[]) => {
    if (pts.length < 2) return pts.length === 1 ? `M ${pts[0].x},${pts[0].y}` : ''
    let d = `M ${pts[0].x},${pts[0].y}`
    for (let i = 1; i < pts.length; i++) {
      const cx = pts[i-1].x + (pts[i].x - pts[i-1].x) / 2
      d += ` C ${cx},${pts[i-1].y} ${cx},${pts[i].y} ${pts[i].x},${pts[i].y}`
    }
    return d
  }

  // Areas for ingresos/gastos fill to the $0 line, not the chart bottom
  const areaPath = (pts: { x: number; y: number }[], fillY: number) =>
    pts.length < 2 ? '' :
    `${linePath(pts)} L ${pts[pts.length-1].x},${fillY} L ${pts[0].x},${fillY} Z`

  // Points — only up to last data month for lines/areas
  const ingPts = D.slice(0, dataEnd).map((d, i) => ({ x: xOf(i), y: yOf(d.ingresos) }))
  const gasPts = D.slice(0, dataEnd).map((d, i) => ({ x: xOf(i), y: yOf(d.gastos) }))

  // zeroY ya está definido arriba como yOfRaw(0)

  // Ahorro mensual = ingresos - gastos de cada mes (mismo eje que ingresos/gastos)
  const ahrValues: (number | null)[] = D.map((d, i) => i < dataEnd ? d.ahorro : null)

  const usePatScale = false  // el eje derecho de patrimonio no se usa en este gráfico
  const ahrY = yOf           // mismo eje izquierdo que ingresos y gastos

  // Segmentos de la línea (se corta donde hay null)
  const ahrSegments: { x: number; y: number }[][] = []
  let ahrSeg: { x: number; y: number }[] = []
  D.slice(0, dataEnd).forEach((_, i) => {
    const v = ahrValues[i]
    if (v !== null) {
      ahrSeg.push({ x: xOf(i), y: ahrY(v) })
    } else {
      if (ahrSeg.length >= 1) ahrSegments.push(ahrSeg)
      ahrSeg = []
    }
  })
  if (ahrSeg.length >= 1) ahrSegments.push(ahrSeg)

  // Track scroll position + visible width for tooltip clamping and fade
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const update = () => { setScrollLeft(el.scrollLeft); setVisibleW(el.clientWidth) }
    update()
    el.addEventListener('scroll', update, { passive: true })
    const ro = new ResizeObserver(update)
    ro.observe(el)
    return () => { el.removeEventListener('scroll', update); ro.disconnect() }
  }, [])

  // Scroll to last month with data on mount
  useEffect(() => {
    if (!scrollRef.current || n === 0) return
    let targetIdx = 0
    for (let i = n - 1; i >= 0; i--) {
      if (D[i].ingresos > 0 || D[i].gastos > 0) { targetIdx = i; break }
    }
    const scrollX = xOf(targetIdx) - scrollRef.current.clientWidth / 2
    scrollRef.current.scrollLeft = Math.max(0, scrollX)
  }, [data])

  // IntersectionObserver: load more future months when scrolling right
  useEffect(() => {
    if (!onLoadMore || !sentinelRef.current || !scrollRef.current) return
    const sentinel  = sentinelRef.current
    const container = scrollRef.current
    const observer  = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) onLoadMore() },
      { root: container, threshold: 0.1 },
    )
    observer.observe(sentinel)
    return () => observer.disconnect()
  }, [onLoadMore, data])

  // Hover: nearest column by mouse X in the SVG
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (n < 1) return
    const rect = e.currentTarget.getBoundingClientRect()
    const mx   = e.clientX - rect.left
    const idx  = Math.round((mx - colW / 2) / colW)
    setHIdx(Math.max(0, Math.min(n - 1, idx)))
  }

  const hoverX    = hIdx !== null ? xOf(hIdx) : null
  const hoverStat = hIdx !== null ? D[hIdx]   : null

  // Tooltip: clamped to the VISIBLE portion of the scroll container
  const CARD_W = 185
  const tooltipLeft = hoverX === null ? 0
    : Math.max(scrollLeft + 4, Math.min(hoverX - CARD_W / 2, scrollLeft + visibleW - CARD_W - 4))

  // Month label: show year only on Jan or year-change
  const fmtLabel = (month: string, i: number) => {
    const [year, m] = month.split('-')
    const prev = D[i - 1]?.month
    const showYear = m === '01' || !prev || prev.split('-')[0] !== year
    return showYear ? `${MONTH_NAMES[m] ?? m} '${year.slice(2)}` : (MONTH_NAMES[m] ?? m)
  }

  // Fade sides: left if scrolled, right if more content exists
  const canScrollLeft  = scrollLeft > 0

  if (n === 0) return null

  return (
    <div className="w-full mt-2 select-none">
      {/* Legend + zoom controls */}
      <div className="flex items-center justify-between mb-3" style={{ paddingLeft: YAXIS_W, paddingRight: YAXIS_R_W }}>
        <div className="flex gap-5 flex-wrap">
          {([
            { color: ING_COLOR, label: 'Ingresos' },
            { color: GAS_COLOR, label: 'Gastos'   },
            { color: AHR_COLOR, label: 'Ahorro acumulado' },
          ] as const).map(({ color, label }) => (
            <div key={label} className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full inline-block" style={{ background: color }} />
              <span className="text-xs text-slate-400 font-medium">{label}</span>
            </div>
          ))}
        </div>
        {/* Zoom buttons */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setColW(w => Math.max(COL_W_MIN, w - COL_W_STEP))}
            disabled={colW <= COL_W_MIN}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-sm font-bold leading-none"
            title="Reducir ancho"
          >−</button>
          <span className="text-xs text-slate-600 w-5 text-center select-none">{colW}</span>
          <button
            onClick={() => setColW(w => Math.min(COL_W_MAX, w + COL_W_STEP))}
            disabled={colW >= COL_W_MAX}
            className="w-6 h-6 flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-700/60 disabled:opacity-30 disabled:cursor-not-allowed transition-all text-sm font-bold leading-none"
            title="Ampliar ancho"
          >+</button>
          <div className="w-px h-4 bg-slate-700 mx-1" />
          <button
            onClick={() => setFitY(f => !f)}
            className={`px-2 h-6 rounded-lg text-[11px] font-medium transition-all ${
              fitY
                ? 'bg-indigo-500/20 text-indigo-400 border border-indigo-500/30'
                : 'text-slate-500 hover:text-slate-300 border border-slate-700/50'
            }`}
            title="Ajustar eje Y al rango de datos visibles"
          >
            Ajustar eje
          </button>
        </div>
      </div>

      <div className="flex">
        {/* Fixed Y-axis — does NOT scroll */}
        <div className="shrink-0" style={{ width: YAXIS_W }}>
          <svg width={YAXIS_W} height={chartH} style={{ display: 'block' }}>
            {ticks.map(tick => (
              <text
                key={tick}
                x={YAXIS_W - 6} y={yOf(tick) + 4}
                textAnchor="end" fontSize="10" fill="rgba(100,116,139,0.7)"
                fontFamily="'Inter', system-ui, sans-serif"
              >
                {fmtTick(tick)}
              </text>
            ))}
          </svg>
        </div>

        {/* Scrollable chart body */}
        <div
          ref={scrollRef}
          className="overflow-x-auto flex-1 relative"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#334155 transparent' }}
        >
          {/* Left fade — indicates more content to the left */}
          {canScrollLeft && (
            <div className="absolute left-0 top-0 bottom-0 w-4 z-10 pointer-events-none"
              style={{ background: isLight
                ? 'linear-gradient(to right, rgba(248,250,252,0.6), transparent)'
                : 'linear-gradient(to right, rgba(2,8,23,0.4), transparent)' }} />
          )}
          <div style={{ width: totalW }} className="relative">
            <svg
              width={totalW} height={chartH}
              onMouseMove={handleMouseMove}
              onMouseLeave={() => setHIdx(null)}
              className="cursor-crosshair block"
            >
              <defs>
                <clipPath id="mcClip">
                  <rect x={0} y={PT} width={totalW} height={innerH} />
                </clipPath>
                <linearGradient id="mcGI" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={ING_COLOR} stopOpacity="0.26" />
                  <stop offset="80%"  stopColor={ING_COLOR} stopOpacity="0.04" />
                  <stop offset="100%" stopColor={ING_COLOR} stopOpacity="0" />
                </linearGradient>
                <linearGradient id="mcGG" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={GAS_COLOR} stopOpacity="0.20" />
                  <stop offset="80%"  stopColor={GAS_COLOR} stopOpacity="0.04" />
                  <stop offset="100%" stopColor={GAS_COLOR} stopOpacity="0" />
                </linearGradient>
                <linearGradient id="mcGA" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%"   stopColor={AHR_COLOR} stopOpacity="0.17" />
                  <stop offset="80%"  stopColor={AHR_COLOR} stopOpacity="0.03" />
                  <stop offset="100%" stopColor={AHR_COLOR} stopOpacity="0" />
                </linearGradient>
              </defs>


              {/* Vertical grid lines — one per month column, clipped to chart area */}
              <g clipPath="url(#mcClip)">
                {D.map((_, i) => (
                  <line key={i}
                    x1={xOf(i)} y1={PT} x2={xOf(i)} y2={PT + innerH}
                    stroke={isLight ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)'}
                    strokeWidth="1"
                  />
                ))}
              </g>

              {/* Horizontal grid lines — one per Y-axis tick */}
              {ticks.map(tick => (
                <line key={tick}
                  x1={0} y1={yOf(tick)} x2={totalW} y2={yOf(tick)}
                  stroke={tick === 0 ? 'rgba(148,163,184,0.22)' : isLight ? 'rgba(0,0,0,0.10)' : 'rgba(255,255,255,0.07)'}
                  strokeWidth={tick === 0 ? 1.5 : 1}
                />
              ))}


              {/* Baseline (bottom of chart) */}
              <line x1={0} y1={baseline} x2={totalW} y2={baseline}
                stroke="rgba(148,163,184,0.12)" strokeWidth="1" />

              {/* Areas (clipped) */}
              <g clipPath="url(#mcClip)">
                <path d={areaPath(ingPts, zeroY)} fill="url(#mcGI)" />
                <path d={areaPath(gasPts, zeroY)} fill="url(#mcGG)" />
              </g>

              {/* Lines (clipped) */}
              <g clipPath="url(#mcClip)">
                <path d={linePath(ingPts)} fill="none" stroke={ING_COLOR} strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round" />
                <path d={linePath(gasPts)} fill="none" stroke={GAS_COLOR} strokeWidth="2.5"
                  strokeLinecap="round" strokeLinejoin="round" />

                {/* Ahorro = patrimonio acumulado — segmentos con glow */}
                {ahrSegments.map((seg, si) => (
                  <g key={si}>
                    <path d={linePath(seg)} fill="none" stroke={AHR_COLOR}
                      strokeWidth="8" strokeOpacity="0.07"
                      strokeLinecap="round" strokeLinejoin="round" />
                    <path d={linePath(seg)} fill="none" stroke={AHR_COLOR}
                      strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
                    {/* Dot visible cuando el segmento tiene un solo punto */}
                    {seg.length === 1 && (
                      <circle cx={seg[0].x} cy={seg[0].y} r="4"
                        fill={AHR_COLOR} stroke={AHR_COLOR} strokeWidth="2" />
                    )}
                  </g>
                ))}

                {/* Puente punteado sobre meses sin tasa */}
                {(() => {
                  const bridges: ReactElement[] = []
                  for (let i = 0; i < dataEnd - 1; i++) {
                    const v0 = patValues[i], v1 = patValues[i + 1]
                    if (v0 !== null && v1 === null) {
                      for (let j = i + 2; j < dataEnd; j++) {
                        const vj = patValues[j]
                        if (vj !== null) {
                          bridges.push(
                            <line key={`gap-${i}-${j}`}
                              x1={xOf(i)} y1={yPat(v0)}
                              x2={xOf(j)} y2={yPat(vj)}
                              stroke={AHR_COLOR} strokeWidth="1.5"
                              strokeOpacity="0.3" strokeDasharray="3 4" />
                          )
                          break
                        }
                      }
                    }
                  }
                  return bridges
                })()}
              </g>

              {/* Current-month highlight + pulsing dots */}
              {D.map((stat, i) => {
                if (stat.month !== todayMonth) return null
                const x = xOf(i)
                const hasDataPt = i < ingPts.length
                return (
                  <g key={i}>
                    <rect x={x - colW / 2 + 2} y={PT} width={colW - 4} height={innerH}
                      fill="rgba(255,255,255,0.025)" rx="4" />
                    {hasDataPt && <circle cx={x} cy={ingPts[i].y} r="5" fill={ING_COLOR} className="animate-pulse" />}
                    {hasDataPt && <circle cx={x} cy={gasPts[i].y} r="5" fill={GAS_COLOR} className="animate-pulse" />}
                    {ahrValues[i] !== null && (
                      <circle cx={x} cy={ahrY(ahrValues[i]!)} r="5" fill={AHR_COLOR} className="animate-pulse" />
                    )}
                  </g>
                )
              })}

              {/* X-axis month labels — year shown only on Jan or year-change */}
              {D.map((d, i) => {
                const isCurrent = d.month === todayMonth
                return (
                  <text
                    key={i} x={xOf(i)} y={chartH - 8}
                    textAnchor="middle" fontSize="10"
                    fill={isCurrent ? ING_COLOR : 'rgba(100,116,139,0.60)'}
                    fontWeight={isCurrent ? '600' : '400'}
                    fontFamily="'Inter', system-ui, sans-serif"
                  >
                    {fmtLabel(d.month, i)}
                  </text>
                )
              })}

              {/* Hover crosshair — dots only shown for months with real data */}
              {hoverX !== null && hIdx !== null && (
                <g>
                  <line x1={hoverX} y1={PT} x2={hoverX} y2={baseline}
                    stroke={isLight ? 'rgba(0,0,0,0.20)' : 'rgba(255,255,255,0.18)'} strokeWidth="1" strokeDasharray="4 3" />
                  {hIdx < dataEnd && (
                    <>
                      <circle cx={hoverX} cy={ingPts[hIdx].y} r="5.5" fill={ING_COLOR}
                        stroke={isLight ? 'rgba(248,250,252,0.9)' : 'rgba(2,8,23,0.85)'} strokeWidth="2.5" />
                      <circle cx={hoverX} cy={gasPts[hIdx].y} r="5.5" fill={GAS_COLOR}
                        stroke={isLight ? 'rgba(248,250,252,0.9)' : 'rgba(2,8,23,0.85)'} strokeWidth="2.5" />
                      {ahrValues[hIdx] !== null && (
                        <circle cx={hoverX} cy={ahrY(ahrValues[hIdx]!)} r="5.5" fill={AHR_COLOR}
                          stroke={isLight ? 'rgba(248,250,252,0.9)' : 'rgba(2,8,23,0.85)'} strokeWidth="2.5" />
                      )}
                    </>
                  )}
                </g>
              )}
            </svg>

            {/* Tooltip card */}
            {hoverStat && hoverX !== null && (
              <div
                className="absolute z-20 pointer-events-none"
                style={{ top: PT + 6, left: tooltipLeft, width: CARD_W, animation: 'confirmIn 0.08s ease-out' }}
              >
                <div className="bg-slate-900/95 border border-slate-700/70 rounded-xl px-4 py-3 shadow-2xl backdrop-blur-sm"
                  style={isLight ? { backgroundColor: 'rgba(255,255,255,0.97)', borderColor: 'rgba(203,213,225,0.8)' } : undefined}>
                  <p className="text-sm font-bold text-white mb-2.5 border-b border-slate-700/60 pb-2">
                    {fmtMonth(hoverStat.month)}
                  </p>
                  {hIdx !== null && hIdx >= dataEnd ? (
                    /* Future month — no data yet */
                    <p className="text-xs text-slate-500 text-center py-1">Sin registros aún</p>
                  ) : (
                    <div className="space-y-2 text-xs">
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-1.5 text-slate-400">
                          <span className="w-2 h-2 rounded-full" style={{ background: ING_COLOR }} />
                          Ingresos
                        </span>
                        <span className="text-white font-bold">{fmtMoney(hoverStat.ingresos, currency, privacy)}</span>
                      </div>
                      <div className="flex justify-between items-center">
                        <span className="flex items-center gap-1.5 text-slate-400">
                          <span className="w-2 h-2 rounded-full" style={{ background: GAS_COLOR }} />
                          Gastos
                        </span>
                        <span className="text-white font-bold">{fmtMoney(hoverStat.gastos, currency, privacy)}</span>
                      </div>
                      {/* Ahorro del mes = ingresos - gastos */}
                      {hIdx !== null && (() => {
                        const val = ahrValues[hIdx]
                        return (
                          <div className="flex justify-between items-center border-t border-slate-700/50 pt-2 mt-1">
                            <span className="flex items-center gap-1.5 text-slate-400">
                              <span className="w-2 h-2 rounded-full" style={{ background: AHR_COLOR }} />
                              Ahorro
                            </span>
                            {val !== null ? (
                              <span className="font-bold" style={{ color: val >= 0 ? AHR_COLOR : '#f87171' }}>
                                {fmtMoney(val, currency, privacy)}
                              </span>
                            ) : (
                              <span className="text-slate-500">—</span>
                            )}
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Right-edge sentinel for infinite scroll */}
            <div ref={sentinelRef} style={{ position: 'absolute', right: 0, top: 0, width: 1, height: 1 }} />
          </div>
        </div>

        {/* Fixed right Y-axis — ahorro acumulado scale (solo cuando hay datos de patrimonio reales) */}
        {usePatScale && (
          <div className="shrink-0" style={{ width: YAXIS_R_W }}>
            <svg width={YAXIS_R_W} height={chartH} style={{ display: 'block' }}>
              {patTicks.map(tick => (
                <text
                  key={tick}
                  x={6} y={yPat(tick) + 4}
                  textAnchor="start" fontSize="10" fill={`${AHR_COLOR}99`}
                  fontFamily="'Inter', system-ui, sans-serif"
                >
                  {fmtTick(tick)}
                </text>
              ))}
              <text
                x={YAXIS_R_W / 2} y={PT - 2}
                textAnchor="middle" fontSize="8" fill={`${AHR_COLOR}55`}
                fontFamily="'Inter', system-ui, sans-serif" letterSpacing="0.05em"
              >
                ACUM
              </text>
            </svg>
          </div>
        )}
      </div>
    </div>
  )
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const [privacyMode,   setPrivacyMode]   = useState(() => localStorage.getItem('privacy') === 'true')
  const [currency,      setCurrency]      = useState('UYU')
  const [settingsOpen,    setSettingsOpen]    = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>(null)
  const [goalModalOpen,    setGoalModalOpen]    = useState(false)
  const [editGoal,         setEditGoal]         = useState<FinGoal | undefined>(undefined)
  const [txModalOpen,      setTxModalOpen]      = useState(false)
  const [confirmDeleteGoalId, setConfirmDeleteGoalId] = useState<string | null>(null)
  const [deletingGoalId,   setDeletingGoalId]   = useState<string | null>(null)
  const [monthsAhead,   setMonthsAhead]   = useState(24)
  const [runwayYears,   setRunwayYears]   = useState(1)
  const [runwayPickerOpen, setRunwayPickerOpen] = useState(false)
  const [customYears,  setCustomYears]  = useState('')
  const [customMonths, setCustomMonths] = useState('')
  const runwayPickerRef = useRef<HTMLDivElement>(null)
  const loadMoreInProgress = useRef(false)
  const patChartRef = useRef<HTMLDivElement>(null)

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['summary'],
    queryFn:  fetchSummary,
  })

  // How many months back to the first transaction
  const monthsBack = useMemo(() => {
    if (!summary?.first_tx_month) return 24
    const [y, m] = summary.first_tx_month.split('-').map(Number)
    const today = new Date()
    const diff = (today.getFullYear() - y) * 12 + (today.getMonth() + 1 - m)
    return Math.max(diff + 1, 2)
  }, [summary?.first_tx_month])

  const { data: chartData = [], isLoading: chartLoading, isFetching: chartFetching } = useQuery({
    queryKey:        ['income-vs-expenses', monthsBack, monthsAhead, currency],
    queryFn:         () => fetchIncomeVsExpenses(monthsBack, monthsAhead, currency),
    enabled:         !!summary,
    placeholderData: keepPreviousData,
  })

  // Reset flag only when a completed fetch delivers new data
  useEffect(() => {
    if (!chartFetching) loadMoreInProgress.current = false
  }, [chartFetching])

  const handleLoadMore = useCallback(() => {
    if (loadMoreInProgress.current || chartFetching) return
    loadMoreInProgress.current = true
    setMonthsAhead(prev => prev + 24)
  }, [chartFetching])

  const { data: finGoals = [], isLoading: goalsLoading } = useQuery({
    queryKey: ['fin-goals'],
    queryFn:  fetchFinGoals,
  })

  const queryClient = useQueryClient()

  const handleDeleteGoal = async () => {
    if (!confirmDeleteGoalId) return
    const id = confirmDeleteGoalId
    setConfirmDeleteGoalId(null)
    setDeletingGoalId(id)
    try {
      await deleteFinGoal(id)
      await queryClient.invalidateQueries({ queryKey: ['fin-goals'] })
      await queryClient.invalidateQueries({ queryKey: ['summary'] })
    } finally {
      setDeletingGoalId(null)
    }
  }

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn:  fetchMe,
  })


  const { data: patrimonioData = [] } = useQuery({
    queryKey: ['patrimonio', monthsBack, monthsAhead, currency],
    queryFn:  () => fetchPatrimonio(monthsBack, monthsAhead, currency),
    enabled:  !!summary,
    placeholderData: keepPreviousData,
  })

  // Auto-scroll patrimonio chart to current month on data load
  useEffect(() => {
    const el = patChartRef.current
    if (!el) return
    el.scrollLeft = el.scrollWidth
  }, [patrimonioData])

  const { data: exchangeRates = [] } = useQuery<ExchangeRate[]>({
    queryKey: ['exchange-rates'],
    queryFn:  fetchExchangeRates,
  })

  // Initialize currency from user preference
  useEffect(() => {
    if (me?.currency_default) setCurrency(me.currency_default)
  }, [me?.currency_default])

  // Close runway picker on outside click
  useEffect(() => {
    if (!runwayPickerOpen) return
    const handler = (e: MouseEvent) => {
      if (runwayPickerRef.current && !runwayPickerRef.current.contains(e.target as Node))
        setRunwayPickerOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [runwayPickerOpen])
  // candados: por defecto todos cerrados
  const [locked,  setLocked]  = useState<Set<string>>(new Set())
  const [pending, setPending] = useState<Record<string, number>>({})
  const [saving,  setSaving]  = useState<Set<string>>(new Set())

  // inicializar candados cuando llegan los goals
  useEffect(() => {
    if (finGoals.length > 0)
      setLocked(new Set(finGoals.map(g => g.id)))
  }, [finGoals.length])

  const toggleLock = (id: string) => {
    setLocked(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else              next.add(id)
      return next
    })
  }

  const getAlloc = (goal: FinGoal) =>
    pending[goal.id] ?? Number(goal.allocation_pct)

  const handleAllocChange = (changedId: string, newValue: number) => {
    // IDs desbloqueados distintos al que se mueve
    const otherOpen = finGoals.filter(g => !locked.has(g.id) && g.id !== changedId)
    // Suma fija de los goals cerrados
    const lockedSum = finGoals
      .filter(g => locked.has(g.id))
      .reduce((s, g) => s + getAlloc(g), 0)
    // Techo disponible para todos los abiertos
    const available = Math.max(0, 100 - lockedSum)
    const clamped   = Math.min(newValue, available)
    const remaining = available - clamped

    const newPending: Record<string, number> = { ...pending, [changedId]: clamped }

    if (otherOpen.length > 0) {
      const otherSum = otherOpen.reduce((s, g) => s + getAlloc(g), 0)
      if (otherSum > 0) {
        // redistribuir proporcionalmente
        for (const g of otherOpen) {
          newPending[g.id] = Math.max(0, (getAlloc(g) / otherSum) * remaining)
        }
      } else {
        // repartir en partes iguales si todos estaban en 0
        const share = remaining / otherOpen.length
        for (const g of otherOpen) newPending[g.id] = share
      }
    }

    setPending(newPending)
  }

  // Guarda todos los goals con cambios pendientes.
  // Orden: primero los que BAJAN (liberan cupo en el backend),
  // luego los que SUBEN — así la validación de suma ≤ 100% no falla.
  const handleAllocSave = async () => {
    const toSave = Object.entries(pending)
    if (toSave.length === 0) return
    setSaving(new Set(toSave.map(([id]) => id)))
    try {
      const sorted = toSave
        .map(([id, val]) => ({
          id,
          val: Math.round(val),
          delta: Math.round(val) - Number(finGoals.find(g => g.id === id)?.allocation_pct ?? 0),
        }))
        .sort((a, b) => a.delta - b.delta) // decreases first

      for (const { id, val } of sorted) {
        await updateFinGoalAllocation(id, val)
      }
      await queryClient.invalidateQueries({ queryKey: ['fin-goals'] })
      setPending({})
    } finally {
      setSaving(new Set())
    }
  }

  // Meses cerrados: meses anteriores al actual con ingresos registrados.
  // Un mes "cierra" automáticamente cuando el usuario registra su primer
  // movimiento del mes siguiente — no requiere lógica extra.
  const closedMonthsStats = useMemo(() => {
    const today  = new Date().toISOString().slice(0, 7) // "2026-03"
    const closed = chartData
      .filter(d => d.month < today && d.ingresos > 0)  // estrictamente anterior
      .slice(-6)                                         // máx. 6 meses
    if (closed.length === 0) return { avg: 0, count: 0 }
    const avg = closed.reduce((s, d) => s + d.ahorro, 0) / closed.length
    return { avg, count: closed.length }
  }, [chartData])

  const avgMonthlySavings = closedMonthsStats.avg

  // Libertad Financiera
  const runway = useMemo(() => {
    const expenses    = Number(summary?.expense_this_month ?? 0)
    const savings     = Number(summary?.net_worth          ?? 0)
    const closedCount = closedMonthsStats.count
    if (expenses <= 0) return { months: 0, days: 0, pct: 0, monthsToTarget: null as number | null, closedCount }
    const raw    = savings / expenses
    const months = Math.floor(raw)
    const days   = Math.round((raw - months) * 30)
    const pct    = Math.min((raw / (runwayYears * 12)) * 100, 100)

    let monthsToTarget: number | null = null
    if (closedCount >= 1) {
      const targetNW = runwayYears * 12 * expenses
      if (savings >= targetNW) {
        monthsToTarget = 0
      } else if (avgMonthlySavings > 0) {
        monthsToTarget = (targetNW - savings) / avgMonthlySavings
      }
    }

    return { months, days, pct, monthsToTarget, closedCount }
  }, [summary, runwayYears, avgMonthlySavings, closedMonthsStats.count])

  return (
    <>
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-4 lg:p-8 selection:bg-emerald-500/30">


      {/* NAV TABS */}
      <nav className="flex gap-1.5 mb-4 overflow-x-auto [scrollbar-width:none] pb-0.5">
        <button className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
          <Activity className="w-4 h-4" /><span className="hidden sm:inline">Análisis Global</span>
        </button>
        <button
          onClick={() => navigate('/stats')}
          className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent transition-colors"
        >
          <BarChart2 className="w-4 h-4" /><span className="hidden sm:inline">Análisis Mensual</span>
        </button>
        <button
          onClick={() => navigate('/hogar')}
          className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent transition-colors"
        >
          <Home className="w-4 h-4" /><span className="hidden sm:inline">Hogar</span>
        </button>
        <button
          onClick={() => navigate('/importacion')}
          className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent transition-colors"
        >
          <Upload className="w-4 h-4" /><span className="hidden sm:inline">Importar</span>
        </button>
      </nav>

      {/* HEADER */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-4 sm:mb-8 gap-3 bg-slate-900/50 p-4 rounded-2xl border border-slate-800/50 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <img
            src={isLight ? '/favicon-light.png' : '/favicon.png'}
            alt="Fluxo"
            className="w-10 h-10 object-contain shrink-0"
          />
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">Fluxo</h1>
            <p className="text-xs text-slate-400 uppercase tracking-widest font-medium">Inteligencia Financiera</p>
          </div>
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          <div className="relative flex items-center bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5">
            <DollarSign className="w-4 h-4 text-emerald-500 mr-2" />
            <select
              value={currency}
              onChange={e => setCurrency(e.target.value)}
              className="bg-transparent text-sm font-medium text-slate-300 outline-none appearance-none cursor-pointer pr-4"
            >
              {['UYU', 'USD', 'EUR'].map(cur => (
                <option key={cur} value={cur} translate="no" className="bg-slate-900">{cur}</option>
              ))}
            </select>
          </div>

          <button onClick={() => { setPrivacyMode(p => { localStorage.setItem('privacy', String(!p)); return !p }) }}
            className="p-2 text-slate-400 hover:text-emerald-400 bg-slate-950 border border-slate-800 rounded-lg transition-colors">
            {privacyMode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 text-slate-400 hover:text-emerald-400 bg-slate-950 border border-slate-800 rounded-lg transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* BARRA DE LIBERTAD FINANCIERA */}
      <div className="mb-4 sm:mb-6 bg-slate-900/40 border border-slate-800/50 rounded-2xl px-4 sm:px-6 py-3 sm:py-4 backdrop-blur-sm relative z-10">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-3">
          <div>
            <p className="text-xs text-slate-500 uppercase font-bold tracking-widest mb-0.5">
              Libertad Financiera
            </p>
            {summaryLoading ? (
              <div className="h-5 w-56 bg-slate-800 animate-pulse rounded" />
            ) : runway.pct === 0 ? (
              <p className="text-sm text-slate-500">
                Registrá gastos este mes para calcular tu autonomía financiera.
              </p>
            ) : (
              <p className="text-sm text-slate-300">
                Con tu ritmo actual podés vivir&nbsp;
                {privacyMode ? (
                  <span className="font-bold text-white">**** meses</span>
                ) : (
                  <>
                    <span className="font-bold text-white text-base">{runway.months}</span>
                    <span className="text-slate-400"> meses</span>
                    {runway.days > 0 && (
                      <> y <span className="font-bold text-white text-base">{runway.days}</span>
                        <span className="text-slate-400"> días</span></>
                    )}
                    <span className="text-slate-500 text-xs ml-2">sin ingresos</span>
                  </>
                )}
              </p>
            )}
          </div>
          <div className="flex items-center gap-4 shrink-0">
            {/* Period picker */}
            <div className="relative" ref={runwayPickerRef}>
              <button
                onClick={() => setRunwayPickerOpen(v => !v)}
                className="flex items-center gap-1.5 h-6 px-2.5 rounded-lg text-[10px] font-bold transition-colors bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/25"
              >
                <span>Plazo</span>
                <svg className={`w-2.5 h-2.5 transition-transform ${runwayPickerOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 10 6">
                  <path d="M1 1l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </button>

              {runwayPickerOpen && (
                <div className="absolute right-0 top-8 z-50 bg-slate-900 border border-slate-700/80 rounded-xl shadow-2xl p-3 w-48"
                  style={{ animation: 'confirmIn 0.12s ease-out' }}
                >
                  <p className="text-[10px] text-slate-500 uppercase font-semibold mb-2 px-1">Personalizado</p>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      min="0"
                      placeholder="Años"
                      value={customYears}
                      onChange={e => setCustomYears(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-500/50 placeholder-slate-600"
                    />
                    <input
                      type="number"
                      min="0"
                      max="11"
                      placeholder="Meses"
                      value={customMonths}
                      onChange={e => setCustomMonths(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg px-2 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-500/50 placeholder-slate-600"
                    />
                  </div>
                  <button
                    onClick={() => {
                      const y = parseFloat(customYears) || 0
                      const m = parseFloat(customMonths) || 0
                      const total = y + m / 12
                      if (total > 0) {
                        setRunwayYears(Math.round(total * 12) / 12)
                        setCustomYears('')
                        setCustomMonths('')
                        setRunwayPickerOpen(false)
                      }
                    }}
                    className="mt-2 w-full py-1.5 rounded-lg text-[11px] font-bold bg-emerald-500/20 text-emerald-400 hover:bg-emerald-500/30 transition-colors border border-emerald-500/30"
                  >
                    Aplicar
                  </button>
                </div>
              )}
            </div>

            <div className="text-right">
              <span className={`text-lg font-bold ${
                runway.pct < 25 ? 'text-red-400' :
                runway.pct < 50 ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                {privacyMode ? '**%' : `${runway.pct.toFixed(0)}%`}
              </span>
              <p className="text-sm font-bold text-slate-400">
                {(() => {
                  if (runwayYears < 1) { const m = Math.round(runwayYears * 12); return `${m} mes${m !== 1 ? 'es' : ''}` }
                  if (runwayYears === 1) return '1 año'
                  if (runwayYears % 1 === 0) return `${runwayYears} años`
                  const y = Math.floor(runwayYears)
                  const m = Math.round((runwayYears - y) * 12)
                  return m > 0 ? `${y} año${y !== 1 ? 's' : ''} ${m} mes${m !== 1 ? 'es' : ''}` : `${y} años`
                })()}
              </p>
            </div>
          </div>
        </div>
        <div className="relative h-2.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className="absolute top-0 left-0 h-full rounded-full transition-all duration-700"
            style={{
              width: `${runway.pct}%`,
              background: runway.pct < 25
                ? 'linear-gradient(90deg,#ef4444,#f87171)'
                : runway.pct < 50
                ? 'linear-gradient(90deg,#f59e0b,#fbbf24)'
                : 'linear-gradient(90deg,#10b981,#34d399)',
            }}
          />
        </div>

        {!summaryLoading && runway.pct > 0 && !privacyMode && (() => {
          if (runway.closedCount === 0) return (
            <p className="text-[11px] text-slate-600 mt-2">
              Completá al menos un mes para estimar el plazo hacia tu objetivo.
            </p>
          )
          if (runway.monthsToTarget === null) return (
            <p className="text-[11px] text-amber-500/80 mt-2">
              El ahorro promedio es negativo — no es posible estimar el plazo.
            </p>
          )
          return (
            <p className="text-[11px] text-slate-500 mt-2">
              {runway.monthsToTarget === 0
                ? <span className="text-emerald-400 font-medium">¡Ya alcanzaste este objetivo!</span>
                : <>
                    A este ritmo,{' '}
                    <span className="text-slate-300 font-medium">{fmtDuration(runway.monthsToTarget)}</span>
                    {' '}para completar la meta
                    {runway.closedCount < 3 && (
                      <span className="text-slate-600"> (basado en {runway.closedCount} mes{runway.closedCount !== 1 ? 'es' : ''})</span>
                    )}
                    .
                  </>
              }
            </p>
          )
        })()}
      </div>

      {/* ── ONBOARDING (usuario nuevo) ──────────────────────────────────── */}
      {!summaryLoading && (summary?.accounts ?? []).length === 0 && (
        <div className="mb-4 sm:mb-6 bg-slate-900/40 border border-slate-700/50 rounded-2xl sm:rounded-3xl p-5 sm:p-8 backdrop-blur-sm">
          <p className="text-xs text-slate-500 uppercase tracking-widest font-bold mb-1">Primeros pasos</p>
          <h2 className="text-lg sm:text-xl font-bold text-white mb-1">Bienvenido a Fluxo</h2>
          <p className="text-sm text-slate-400 mb-6">Seguí estos pasos para empezar a ver tu panorama financiero.</p>

          <div className="flex flex-col sm:flex-row gap-3">
            {/* Paso 1 */}
            <button
              onClick={() => { setSettingsOpen(true); setSettingsSection('cuentas') }}
              className="flex-1 group flex items-start gap-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-emerald-500/40 rounded-2xl p-4 text-left transition-all"
            >
              <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0 group-hover:bg-emerald-500/25 transition-colors">
                <Wallet className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-bold text-emerald-500/70 uppercase tracking-widest">Paso 1</span>
                </div>
                <p className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">Creá una cuenta</p>
                <p className="text-xs text-slate-500 mt-0.5">Efectivo, débito, crédito o inversión</p>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-emerald-400 shrink-0 mt-1 transition-colors" />
            </button>

            {/* Paso 2 */}
            <button
              onClick={() => setTxModalOpen(true)}
              className="flex-1 group flex items-start gap-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-indigo-500/40 rounded-2xl p-4 text-left transition-all"
            >
              <div className="w-9 h-9 rounded-xl bg-indigo-500/15 border border-indigo-500/30 flex items-center justify-center shrink-0 group-hover:bg-indigo-500/25 transition-colors">
                <Plus className="w-4 h-4 text-indigo-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-bold text-indigo-500/70 uppercase tracking-widest">Paso 2</span>
                </div>
                <p className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">Registrá un movimiento</p>
                <p className="text-xs text-slate-500 mt-0.5">Ingreso o gasto de este mes</p>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-indigo-400 shrink-0 mt-1 transition-colors" />
            </button>

            {/* Paso 3 */}
            <button
              onClick={() => navigate('/hogar')}
              className="flex-1 group flex items-start gap-4 bg-slate-800/50 hover:bg-slate-800 border border-slate-700/50 hover:border-violet-500/40 rounded-2xl p-4 text-left transition-all"
            >
              <div className="w-9 h-9 rounded-xl bg-violet-500/15 border border-violet-500/30 flex items-center justify-center shrink-0 group-hover:bg-violet-500/25 transition-colors">
                <Users className="w-4 h-4 text-violet-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-bold text-violet-500/70 uppercase tracking-widest">Paso 3</span>
                </div>
                <p className="text-sm font-semibold text-slate-200 group-hover:text-white transition-colors">Invitá a tu pareja</p>
                <p className="text-xs text-slate-500 mt-0.5">Finanzas del hogar compartidas</p>
              </div>
              <ArrowRight className="w-4 h-4 text-slate-600 group-hover:text-violet-400 shrink-0 mt-1 transition-colors" />
            </button>
          </div>
        </div>
      )}

      {/* GRID PRINCIPAL */}
      <div className="space-y-4 sm:space-y-6">

          {/* Gráfica mensual */}
          <div id="fluxo-export-chart" className="bg-slate-900/40 border border-slate-800/50 rounded-2xl sm:rounded-3xl p-4 sm:p-6 backdrop-blur-sm">
            <div className="flex items-center justify-between mb-1">
              <h2 className="text-sm font-medium text-slate-400">Ingresos · Gastos · Ahorro</h2>
              <span className="text-[10px] text-slate-600 uppercase">mové el cursor para ver detalle</span>
            </div>
            {chartLoading ? (
              <div className="h-48 bg-slate-800/50 animate-pulse rounded-xl mt-4" />
            ) : !chartData.some(d => d.ingresos > 0 || d.gastos > 0) ? (
              <div className="relative mt-4 rounded-2xl overflow-hidden">
                <ChartWaveCanvas />
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-2">
                  <div className={`flex items-center gap-2 px-5 py-2.5 rounded-xl border backdrop-blur-md shadow-2xl ${isLight ? 'border-slate-300 bg-white/90 text-slate-700' : 'border-slate-700/50 text-slate-300'}`}
                    style={isLight ? {} : { background: 'rgba(2,8,23,0.72)' }}>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    <p className="text-sm font-medium">
                      Registrá un ingreso o gasto para ver la gráfica.
                    </p>
                  </div>
                </div>
              </div>
            ) : (
              <MonthlyChart data={chartData.filter(d => !summary?.first_tx_month || d.month >= summary.first_tx_month)} patrimonio={patrimonioData} privacy={privacyMode} currency={currency} onLoadMore={handleLoadMore} />
            )}
          </div>

        {/* ── Resumen mes actual + deltas ────────────────────────────────── */}
        {(() => {
          const todayM = new Date().toISOString().slice(0, 7)
          const cur  = chartData.find(d => d.month === todayM)
          const idx  = chartData.findIndex(d => d.month === todayM)
          const prev = idx > 0 ? chartData[idx - 1] : null
          if (!cur || (cur.ingresos === 0 && cur.gastos === 0)) return null

          const delta = (val: number, prevVal: number | undefined) => {
            if (!prevVal || prevVal === 0) return null
            return ((val - prevVal) / prevVal) * 100
          }
          const [, prevMonthName] = [
            MONTH_NAMES[todayM.slice(5, 7)],
            prev ? MONTH_NAMES[prev.month.slice(5, 7)] : '',
          ]

          const cards = [
            { label: 'Ingresos este mes',  value: cur.ingresos, prev: prev?.ingresos, color: 'text-cyan-400',    higherIsBetter: true  },
            { label: 'Gastos este mes',    value: cur.gastos,   prev: prev?.gastos,   color: 'text-rose-400',    higherIsBetter: false },
            { label: 'Ahorro este mes',    value: cur.ahorro,   prev: prev?.ahorro,   color: cur.ahorro >= 0 ? 'text-emerald-400' : 'text-red-400', higherIsBetter: true  },
          ]

          return (
            <div className="grid grid-cols-3 gap-2 sm:gap-3">
              {cards.map(({ label, value, prev: pv, color, higherIsBetter }) => {
                const d     = delta(value, pv)
                const up    = d !== null && d > 0
                const good  = d !== null && (higherIsBetter ? up : !up)
                return (
                  <div key={label} className="bg-slate-900/40 border border-slate-800/50 rounded-2xl px-3 sm:px-4 py-3 backdrop-blur-sm">
                    <p className="text-[10px] sm:text-xs text-slate-500 uppercase tracking-wider mb-1.5 leading-tight">{label}</p>
                    <p className={`text-sm sm:text-base font-bold tabular-nums ${color}`}>
                      {privacyMode ? '••••' : fmtMoney(value, currency)}
                    </p>
                    {!privacyMode && d !== null && Math.abs(d) >= 0.5 && (
                      <div className="flex items-center gap-1 mt-0.5">
                        <span className={`text-[10px] sm:text-xs font-bold ${good ? 'text-emerald-400' : 'text-rose-400'}`}>
                          {up ? '↑' : '↓'}{Math.abs(d).toFixed(1)}%
                        </span>
                        {prevMonthName && <span className="text-[9px] sm:text-[10px] text-slate-600">vs {prevMonthName}</span>}
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )
        })()}

        {/* Patrimonio + Cuentas */}
        <div className="space-y-4 sm:space-y-6">

          {/* Patrimonio Neto */}
          <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl sm:rounded-3xl p-4 sm:p-6">

            {/* Patrimonio bar chart */}
            {(() => {
              const firstMonth = summary?.first_tx_month ?? ''
              const bars = patrimonioData.filter(p => p.value !== null && (!firstMonth || p.month >= firstMonth))
              if (bars.length === 0) return null

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
                                {privacyMode ? '·····' : fmtCompact(p.value!)}
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
              const validPat   = patrimonioData.filter(p => p.value !== null)
              const curIdx     = validPat.findIndex(p => p.month === todayLabel)
              const prevPat    = curIdx > 0 ? validPat[curIdx - 1] : null
              const netWorth   = Number(summary?.net_worth ?? 0)
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
                        {summaryLoading ? '…' : fmtMoney(netWorth, currency, privacyMode)}
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

          {/* Desglose por cuenta */}
          <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl sm:rounded-3xl p-4 sm:p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 bg-cyan-500/10 rounded-lg">
                <CreditCard className="w-4 h-4 text-cyan-400" />
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Cuentas</h2>
                <p className="text-xs text-slate-500">Saldo actual por cuenta</p>
              </div>
            </div>
            {summaryLoading ? (
              <div className="space-y-2">
                {[1,2,3].map(i => <div key={i} className="h-12 bg-slate-800 animate-pulse rounded-xl" />)}
              </div>
            ) : (summary?.accounts ?? []).length === 0 ? (
              <p className="text-xs text-slate-600">Sin cuentas registradas</p>
            ) : (
              <div className="space-y-1.5">
                {(summary?.accounts ?? []).map(acc => {
                  const isCredit  = acc.type === 'credit'
                  const isForeign = acc.currency !== currency

                  const rate: number | null = isForeign ? (() => {
                    const direct = exchangeRates
                      .filter(r => r.from_currency === acc.currency && r.to_currency === currency)
                      .sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month)[0]
                    if (direct) return direct.rate
                    const inv = exchangeRates
                      .filter(r => r.from_currency === currency && r.to_currency === acc.currency)
                      .sort((a, b) => b.year !== a.year ? b.year - a.year : b.month - a.month)[0]
                    return inv ? 1 / inv.rate : null
                  })() : null

                  const iconClass = 'w-4 h-4'
                  const iconBg: Record<string, string> = {
                    cash: 'text-emerald-400 bg-emerald-400/10',
                    debit: 'text-cyan-400 bg-cyan-400/10',
                    credit: 'text-rose-400 bg-rose-400/10',
                    investment: 'text-violet-400 bg-violet-400/10',
                  }
                  const typeDesc: Record<string, string> = {
                    cash: 'Saldo Disponible',
                    debit: 'Saldo Disponible',
                    credit: 'Línea de Crédito',
                    investment: 'Saldo Disponible',
                  }

                  return (
                    <div key={acc.id}
                      className="flex items-center gap-3 bg-slate-800/30 rounded-xl px-3 py-2.5">
                      <div className={`p-1.5 rounded-lg shrink-0 ${iconBg[acc.type] ?? 'text-slate-400 bg-slate-800'}`}>
                        {acc.type === 'cash'       ? <Wallet     className={iconClass} /> :
                         acc.type === 'investment' ? <TrendingUp className={iconClass} /> :
                                                     <CreditCard className={iconClass} />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-semibold text-slate-200 truncate">{acc.name}</p>
                        <p className="text-[10px] text-slate-500">{typeDesc[acc.type] ?? 'Cuenta'}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-bold tabular-nums ${isCredit || acc.balance < 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                          {fmtMoney(acc.balance, acc.currency, privacyMode)}
                        </p>
                        {isForeign && rate !== null && (
                          <p className="text-[10px] text-slate-500 tabular-nums">
                            ≈ {fmtMoney(acc.balance * rate, currency, privacyMode)}
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* METAS FINANCIERAS — full width                                  */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl sm:rounded-3xl p-4 sm:p-6 backdrop-blur-sm">
          {/* Header */}
          <div className="flex items-start justify-between mb-5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-500/20 rounded-lg">
                <TrendingUp className="w-5 h-5 text-indigo-400" />
              </div>
              <div>
                <h2 className="text-lg font-semibold text-white">Metas Financieras</h2>
                {!summaryLoading && (() => {
                  const freeFlow   = Number(summary?.net_this_month ?? 0)
                  const totalAlloc = finGoals.reduce((s, g) => s + Number(g.allocation_pct), 0)
                  return (
                    <p className="text-xs text-slate-400 mt-0.5">
                      Flujo libre:{' '}
                      <span className={`font-medium ${freeFlow >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {fmtMoney(freeFlow, currency, privacyMode)}
                      </span>
                      {finGoals.length > 0 && (
                        <> · <span className="text-indigo-300 font-medium">{totalAlloc}% asignado</span></>
                      )}
                    </p>
                  )
                })()}
              </div>
            </div>
            <button
              onClick={() => { setEditGoal(undefined); setGoalModalOpen(true) }}
              className="shrink-0 flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/20 hover:bg-indigo-500/30 text-indigo-300 text-xs font-medium rounded-lg transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Nueva meta
            </button>
          </div>

          <div className="flex flex-col gap-4">
            {/* Insight de flujo */}
            {!summaryLoading && !goalsLoading && (
              <div className="bg-indigo-500/8 border border-indigo-500/20 rounded-xl p-4">
                {(() => {
                  const freeFlow    = Number(summary?.net_this_month ?? 0)
                  const totalAlloc  = finGoals.reduce((s, g) => s + Number(g.allocation_pct), 0)
                  const extraAmount = freeFlow > 0 ? freeFlow * 0.1 : 0
                  const incomplete  = finGoals.filter(g => !g.is_completed)
                  const closest     = [...incomplete].sort((a, b) =>
                    (Number(b.current_amount ?? 0) / Number(b.target_amount)) -
                    (Number(a.current_amount ?? 0) / Number(a.target_amount))
                  )[0]

                  if (freeFlow <= 0) return (
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Tu flujo neto este mes es{' '}
                      <span className="font-bold text-rose-400">{fmtMoney(freeFlow, currency, privacyMode)}</span>.
                      {' '}Revisá tus gastos para liberar flujo hacia tus metas.
                    </p>
                  )
                  if (finGoals.length === 0) return (
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Tenés{' '}
                      <span className="font-bold text-emerald-400">{fmtMoney(freeFlow, currency, privacyMode)}</span>
                      {' '}de flujo libre este mes. Creá una meta para empezar a asignarlo.
                    </p>
                  )
                  if (totalAlloc < 90 && extraAmount > 0) return (
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Flujo libre:{' '}
                      <span className="font-bold text-emerald-400">{fmtMoney(freeFlow, currency, privacyMode)}</span>.
                      {' '}Podrías redirigir un{' '}
                      <span className="font-bold text-indigo-300">10% más</span>
                      {' '}({privacyMode ? '****' : `~${fmtMoney(extraAmount, currency, false)}`}) hacia tus metas
                      {closest ? ` y acercar "${closest.name}" un paso más` : ''}.
                    </p>
                  )
                  return (
                    <p className="text-xs text-slate-300 leading-relaxed">
                      Excelente — <span className="font-bold text-indigo-300">{totalAlloc}%</span> de tu flujo
                      {' '}(<span className="font-bold text-emerald-400">{fmtMoney(freeFlow, currency, privacyMode)}</span>)
                      {' '}ya está asignado a tus metas.
                    </p>
                  )
                })()}
              </div>
            )}

            {/* Goals */}
            {goalsLoading ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {[1, 2, 3].map(i => (
                  <div key={i} className="h-32 bg-slate-800/50 animate-pulse rounded-xl" />
                ))}
              </div>
            ) : finGoals.length === 0 ? (
              <div className="text-center py-10">
                <div className="inline-flex items-center justify-center w-12 h-12 bg-indigo-500/10 rounded-2xl mb-3">
                  <TrendingUp className="w-6 h-6 text-indigo-400/60" />
                </div>
                <p className="text-slate-400 text-sm font-medium mb-1">Sin metas todavía</p>
                <p className="text-slate-500 text-xs">Creá tu primera meta y empezá a asignar flujo mensual.</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {finGoals.map((goal, idx) => {
                  const current  = Number(goal.current_amount ?? 0)
                  const target   = Number(goal.target_amount)
                  const progPct  = target > 0 ? Math.min((current / target) * 100, 100) : 0
                  const alloc    = getAlloc(goal)
                  const isLocked = locked.has(goal.id)
                  const isSaving = saving.has(goal.id)

                  return (
                    <div key={goal.id}
                      className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-4 transition-all"
                    >
                      {/* Header: nombre + acciones + candado */}
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-sm font-medium text-slate-200 truncate">{goal.name}</span>
                        <div className="flex items-center gap-0.5 shrink-0 ml-2">
                          <button
                            onClick={() => { setEditGoal(goal); setGoalModalOpen(true) }}
                            className="p-1 text-slate-500 hover:text-slate-200 rounded-lg hover:bg-slate-800 transition-colors"
                            title="Editar meta"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setConfirmDeleteGoalId(goal.id)}
                            disabled={deletingGoalId === goal.id}
                            className="p-1 text-slate-500 hover:text-red-400 rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-40"
                            title="Eliminar meta"
                          >
                            {deletingGoalId === goal.id
                              ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              : <Trash2  className="w-3.5 h-3.5" />}
                          </button>
                          <button
                            onClick={() => toggleLock(goal.id)}
                            className={`p-1 rounded-lg transition-all ${
                              isLocked
                                ? 'text-slate-500 hover:text-slate-300'
                                : 'text-emerald-400 hover:text-emerald-300 bg-emerald-400/10'
                            }`}
                            title={isLocked ? 'Desbloquear para editar flujo' : 'Bloquear'}
                          >
                            {isLocked
                              ? <Lock     className="w-3.5 h-3.5" />
                              : <LockOpen className="w-3.5 h-3.5" />
                            }
                          </button>
                        </div>
                      </div>

                      {/* Barra de progreso hacia la meta */}
                      <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden mb-2">
                        <div
                          className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${goalColor(idx)}`}
                          style={{ width: `${progPct}%` }}
                        />
                      </div>

                      {/* Texto de progreso */}
                      <p className="text-xs text-slate-400 mb-1">
                        {privacyMode
                          ? `**** / **** · vas al ${progPct.toFixed(0)}% de alcanzar tu objetivo`
                          : `${fmtMoney(current, currency, false)} / ${fmtMoney(target, currency, false)} · vas al `
                        }
                        {!privacyMode && (
                          <span className={`font-bold ${progPct >= 100 ? 'text-emerald-400' : 'text-white'}`}>
                            {progPct.toFixed(0)}%
                          </span>
                        )}
                        {!privacyMode && ' de alcanzar tu objetivo'}
                      </p>

                      {/* Tiempo estimado */}
                      {!privacyMode && (() => {
                        if (progPct >= 100) return (
                          <p className="text-xs text-emerald-400 font-medium mb-2">¡Meta alcanzada!</p>
                        )
                        if (closedMonthsStats.count === 0) return (
                          <p className="text-xs text-slate-400 mb-2">
                            Completá al menos un mes para estimar el plazo.
                          </p>
                        )
                        if (alloc === 0) return (
                          <p className="text-xs text-slate-400 mb-2">Sin flujo asignado — no es posible estimar el plazo.</p>
                        )
                        const monthlyContrib = avgMonthlySavings * alloc / 100
                        if (monthlyContrib <= 0) return (
                          <p className="text-xs text-amber-500/80 mb-2">Ahorro promedio negativo — revisá tus gastos.</p>
                        )
                        const remaining = target - current
                        const mths = remaining / monthlyContrib
                        return (
                          <p className="text-xs text-slate-400 mb-2">
                            A este ritmo,{' '}
                            <span className="text-slate-300 font-medium">{fmtDuration(mths)}</span>
                            {' '}para completar la meta
                            {closedMonthsStats.count < 3 && (
                              <span className="text-slate-500"> (basado en {closedMonthsStats.count} mes{closedMonthsStats.count !== 1 ? 'es' : ''})</span>
                            )}
                            .
                          </p>
                        )
                      })()}

                      {/* Asignación de flujo — visible solo cuando desbloqueado */}
                      <div className={`overflow-hidden transition-all duration-300 ${isLocked ? 'max-h-0 opacity-0' : 'max-h-24 opacity-100'}`}>
                        <div className="pt-2 border-t border-slate-800">
                          <div className="flex items-center justify-between mb-1">
                            <span className="text-xs text-slate-400 uppercase tracking-wide">
                              % del flujo asignado
                            </span>
                            <span className="text-xs font-bold text-emerald-400">
                              {alloc.toFixed(0)}%
                            </span>
                          </div>
                          <input
                            type="range" min={0} max={100} step={1}
                            value={alloc}
                            onChange={e => handleAllocChange(goal.id, Number(e.target.value))}
                            onMouseUp={handleAllocSave}
                            onTouchEnd={handleAllocSave}
                            disabled={isSaving}
                            className="w-full h-1.5 rounded-full appearance-none cursor-pointer accent-emerald-400 disabled:opacity-50"
                            style={{ background: `linear-gradient(to right, #34d399 ${alloc}%, ${isLight ? '#cbd5e1' : '#334155'} ${alloc}%)` }}
                          />
                          {isSaving && (
                            <p className="text-xs text-slate-400 mt-1 text-right">Guardando…</p>
                          )}
                        </div>
                      </div>

                      {/* Flujo asignado cuando bloqueado */}
                      {isLocked && (
                        <p className="text-xs text-slate-400">
                          Flujo asignado: <span className="text-slate-300 font-medium">{alloc.toFixed(0)}%</span>
                        </p>
                      )}
                    </div>
                  )
                })}
              </div>
            )}

          </div>

        </div>

        </div>{/* end Patrimonio+Cuentas */}

      </div>
    </div>

    {/* FAB — registrar movimiento */}
    <button
      onClick={() => setTxModalOpen(true)}
      className="fixed bottom-6 right-6 z-30 w-14 h-14 bg-gradient-to-br from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 text-slate-950 rounded-full shadow-lg shadow-emerald-500/30 flex items-center justify-center transition-all active:scale-95"
      title="Registrar Movimiento"
    >
      <Plus className="w-6 h-6" />
    </button>

    <ConfirmDialog
      open={!!confirmDeleteGoalId}
      title="Eliminar meta"
      message="¿Eliminar esta meta? Esta acción no se puede deshacer."
      confirmLabel="Eliminar"
      cancelLabel="Cancelar"
      danger
      onConfirm={handleDeleteGoal}
      onCancel={() => setConfirmDeleteGoalId(null)}
    />

    <SettingsDrawer
      open={settingsOpen}
      onClose={() => { setSettingsOpen(false); setSettingsSection(null) }}
      initialSection={settingsSection}
    />
    <GoalModal
      open={goalModalOpen}
      onClose={() => { setGoalModalOpen(false); setEditGoal(undefined) }}
      goal={editGoal}
      existingGoals={finGoals}
    />
    <TransactionModal
      open={txModalOpen}
      onClose={() => setTxModalOpen(false)}
    />
    </>
  )
}

