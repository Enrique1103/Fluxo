import { useState, useRef, useEffect, type ReactElement } from 'react'
import type { MonthlyStat, MonthlyPatrimonio } from '../api/dashboard'
import useTheme from '../hooks/useTheme'

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

function fmtMoney(n: number, currency = 'UYU', privacy = false) {
  if (privacy) return '****'
  return new Intl.NumberFormat('es-UY', {
    style: 'currency', currency, maximumFractionDigits: 0, currencyDisplay: 'narrowSymbol',
  }).format(n)
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

export default MonthlyChart
export { ING_COLOR, GAS_COLOR, AHR_COLOR, fmtMoney, fmtMonth, MONTH_NAMES, ChartWaveCanvas }
