import React, { useState, useMemo, useEffect } from 'react'
import useTheme from '../hooks/useTheme'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Activity, BarChart2, ChevronLeft, ChevronRight, ChevronDown,
  Eye, EyeOff, TrendingUp, TrendingDown, Settings,
  CreditCard, Wallet, Upload, X, Search, Home, Pencil, DollarSign,
} from 'lucide-react'
import ExportButton from '../components/ExportButton'
import { exportMonthlyPDF } from '../lib/exportPDF'
import {
  fetchMonthlyBreakdown,
  fetchSummary,
  fetchMe,
  deleteTransaction,
  cancelInstalmentPlan,
  type MonthlyBreakdown,
  type CategoryStat,
  type PaymentMethod,
} from '../api/dashboard'
import SettingsDrawer from '../components/SettingsDrawer'
import TransactionModal from '../components/TransactionModal'
import ConfirmDialog from '../components/ConfirmDialog'
import FAB from '../components/FAB'
import VoiceExpenseModal from '../components/VoiceExpenseModal'
import { invalidateFinancialData } from '../lib/queryClient'

// ─── Helpers ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

const MONTH_SHORT: Record<string, string> = {
  '01':'Ene','02':'Feb','03':'Mar','04':'Abr','05':'May','06':'Jun',
  '07':'Jul','08':'Ago','09':'Sep','10':'Oct','11':'Nov','12':'Dic',
}

function fmtMoney(n: number, currency = 'UYU', privacy = false) {
  if (privacy) return '****'
  return new Intl.NumberFormat('es-UY', {
    style: 'currency', currency, maximumFractionDigits: 0, currencyDisplay: 'narrowSymbol',
  }).format(n)
}

function fmtDate(iso: string) {
  const [, m, d] = iso.split('-')
  return `${d} ${MONTH_SHORT[m]}`
}

const CAT_COLORS = [
  '#22d3ee','#f43f5e','#a78bfa','#fb923c','#34d399',
  '#facc15','#60a5fa','#f472b6','#4ade80','#e879f9',
]

function catColor(idx: number) { return CAT_COLORS[idx % CAT_COLORS.length] }

const WARN_PCT   = 20
const DANGER_PCT = 35
function semColor(pct: number) {
  if (pct > DANGER_PCT) return { bar: '#ef4444', badge: 'bg-red-500/15 text-red-400 border border-red-500/20' }
  if (pct > WARN_PCT)   return { bar: '#f59e0b', badge: 'bg-amber-500/15 text-amber-400 border border-amber-500/20' }
  return                       { bar: '#22c55e', badge: 'bg-green-500/15 text-green-400 border border-green-500/20' }
}

// ─── Payment Method Badge ─────────────────────────────────────────────────────

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  efectivo:               'Efectivo',
  tarjeta_credito:        'T. Crédito',
  tarjeta_debito:         'T. Débito',
  transferencia_bancaria: 'Transferencia',
  billetera_digital:      'Billetera',
  otro:                   'Otro',
}

const PAYMENT_METHOD_STYLES: Record<PaymentMethod, string> = {
  efectivo:               'bg-slate-500/20 text-slate-400 border-slate-500/30',
  tarjeta_credito:        'bg-blue-500/20 text-blue-400 border-blue-500/30',
  tarjeta_debito:         'bg-emerald-500/20 text-emerald-400 border-emerald-500/30',
  transferencia_bancaria: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  billetera_digital:      'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  otro:                   'bg-slate-600/20 text-slate-500 border-slate-600/30',
}

function PaymentBadge({ method }: { method: PaymentMethod }) {
  return (
    <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-xs font-medium border ${PAYMENT_METHOD_STYLES[method]}`}>
      {PAYMENT_METHOD_LABELS[method]}
    </span>
  )
}

// ─── Donut ────────────────────────────────────────────────────────────────────

function DonutChart({
  data, privacy, selectedCategory, onCategoryClick, mode = 'expense',
}: {
  data: MonthlyBreakdown
  privacy: boolean
  selectedCategory?: string | null
  onCategoryClick?: (name: string | null) => void
  mode?: 'expense' | 'income'
}) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const [hovered, setHovered] = useState<number | null>(null)

  const { income, categories } = data
  const total = categories.reduce((s, c) => s + c.total, 0)
  if (total === 0) return null

  const SIZE = 178, cx = 89, cy = 89, R = 73, r = 45
  const GAP = 0.025
  let angle = -Math.PI / 2

  const slices = categories.map((cat, i) => {
    const frac   = cat.total / total
    const sweep  = frac * Math.PI * 2
    const start  = angle + GAP / 2
    const end    = angle + sweep - GAP / 2
    const mid    = angle + sweep / 2
    angle       += sweep
    return { frac, sweep, start, end, mid, color: catColor(i), name: cat.name, total: cat.total }
  })

  function arcPath(start: number, end: number) {
    const large = end - start > Math.PI ? 1 : 0
    const ox = cx + R * Math.cos(start), oy = cy + R * Math.sin(start)
    const ex = cx + R * Math.cos(end),   ey = cy + R * Math.sin(end)
    const ix = cx + r * Math.cos(end),   iy = cy + r * Math.sin(end)
    const bx = cx + r * Math.cos(start), by = cy + r * Math.sin(start)
    return `M ${ox} ${oy} A ${R} ${R} 0 ${large} 1 ${ex} ${ey} L ${ix} ${iy} A ${r} ${r} 0 ${large} 0 ${bx} ${by} Z`
  }

  const hasSelection = selectedCategory != null
  const hovSeg = hovered !== null ? slices[hovered] : null
  const textColor = isLight ? '#0f172a' : '#e2e8f0'
  const subColor  = isLight ? '#475569' : '#64748b'

  const fmtAmt = (v: number) =>
    privacy ? '****' : v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`

  return (
    <div className="shrink-0">
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: SIZE, height: SIZE }}>
        {slices.map((s, i) => {
          const isSelected = selectedCategory === s.name
          const dimmed = hovered !== null ? hovered !== i : hasSelection && !isSelected
          const dx = hovered === i ? Math.cos(s.mid) * 5 : 0
          const dy = hovered === i ? Math.sin(s.mid) * 5 : 0
          return (
            <path
              key={i}
              d={arcPath(s.start, s.end)}
              fill={s.color}
              fillOpacity={dimmed ? 0.25 : 0.9}
              stroke="#0f172a"
              strokeWidth="2"
              style={{
                cursor: 'pointer',
                transform: `translate(${dx}px, ${dy}px)`,
                transition: 'fill-opacity 0.15s, transform 0.15s',
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => onCategoryClick?.(isSelected ? null : s.name)}
            />
          )
        })}

        {hovSeg ? (
          <>
            <text x={cx} y={cy - 14} textAnchor="middle"
              style={{ fontSize: '7px', fontWeight: 600, fill: hovSeg.color, letterSpacing: '0.02em' }}>
              {hovSeg.name.length > 14 ? hovSeg.name.slice(0, 13) + '…' : hovSeg.name}
            </text>
            <text x={cx} y={cy + 2} textAnchor="middle" fill={textColor} fontSize="13" fontWeight="700">
              {fmtAmt(hovSeg.total)}
            </text>
            <text x={cx} y={cy + 15} textAnchor="middle" fill={subColor} fontSize="8">
              {privacy ? '**%' : `${(hovSeg.frac * 100).toFixed(1)}%`}
            </text>
          </>
        ) : (
          <>
            <text x={cx} y={cy - 9} textAnchor="middle" fill={textColor} fontSize="12" fontWeight="700">
              {fmtAmt(total)}
            </text>
            <text x={cx} y={cy + 5} textAnchor="middle" fill={subColor} fontSize="7.5">
              {mode === 'income' ? 'en ingresos' : 'en gastos'}
            </text>
            {mode === 'expense' && income > 0 && (
              <text x={cx} y={cy + 18} textAnchor="middle" fill={isLight ? '#059669' : '#34d399'} fontSize="8" fontWeight="600">
                {privacy ? '**%' : `${((total / income) * 100).toFixed(0)}% del ing.`}
              </text>
            )}
          </>
        )}
      </svg>
    </div>
  )
}

// ─── Heatmap ─────────────────────────────────────────────────────────────────

function ExpenseHeatmap({
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

  // Build calendar grid
  const firstDay = new Date(year, month - 1, 1)
  const lastDay  = new Date(year, month, 0).getDate()
  // Monday-based: 0=Mon..6=Sun
  const startDow = (firstDay.getDay() + 6) % 7

  const cells: { day: number | null; date: string | null }[] = []
  for (let i = 0; i < startDow; i++) cells.push({ day: null, date: null })
  for (let d = 1; d <= lastDay; d++) {
    const mm = String(month).padStart(2, '0')
    const dd = String(d).padStart(2, '0')
    cells.push({ day: d, date: `${year}-${mm}-${dd}` })
  }

  const DOW = ['L','M','X','J','V','S','D']

  // Multi-stop heat color: transparent → amber → orange → rose → crimson
  const heatColor = (intensity: number): string => {
    if (intensity <= 0) return 'rgba(255,255,255,0.03)'
    const stops: [number, [number,number,number]][] = [
      [0.00, [251, 191,  36]],  // amber-400
      [0.25, [251, 146,  60]],  // orange-400
      [0.50, [251, 113, 133]],  // rose-400
      [0.75, [244,  63,  94]],  // rose-500
      [1.00, [159,  18,  57]],  // rose-900
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
      {/* Day headers */}
      <div className="grid grid-cols-7 mb-1">
        {DOW.map(d => (
          <div key={d} className="text-center text-sm font-bold text-slate-600 py-1">{d}</div>
        ))}
      </div>

      {/* Day cells */}
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

      {/* Scale legend */}
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

// ─── Transaction Table ────────────────────────────────────────────────────────

const ALL_PAYMENT_METHODS: PaymentMethod[] = [
  'efectivo', 'tarjeta_credito', 'tarjeta_debito',
  'transferencia_bancaria', 'billetera_digital', 'otro',
]

function TxTable({
  transactions, privacy, currency, onDelete, onEdit, onConfirmOpenChange, categoryFilter,
}: {
  transactions: MonthlyBreakdown['transactions']
  privacy: boolean
  currency: string
  onDelete?: (id: string) => Promise<void>
  onEdit?: (id: string) => void
  onConfirmOpenChange?: (open: boolean) => void
  categoryFilter?: string | null
}) {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<'all' | 'income' | 'expense' | 'transfer'>('all')
  const [methodFilter, setMethodFilter] = useState<PaymentMethod | 'all'>('all')
  const [search, setSearch] = useState('')
  const [internalCategory, setInternalCategory] = useState<string | null>(categoryFilter ?? null)
  const [amountFilter, setAmountFilter] = useState('')
  const [openDropdown, setOpenDropdown] = useState<'tipo' | 'categoria' | 'metodo' | null>(null)
  const [deletingId,  setDeletingId]  = useState<string | null>(null)
  const [confirmId,   setConfirmId]   = useState<string | null>(null)
  const [cuotaConfirm, setCuotaConfirm] = useState<{ txId: string; planId: string } | null>(null)

  useEffect(() => { setInternalCategory(categoryFilter ?? null) }, [categoryFilter])

  const availableCategories = useMemo(() => {
    const cats = new Set<string>()
    transactions.forEach(t => { if (t.category_name) cats.add(t.category_name) })
    return Array.from(cats).sort()
  }, [transactions])

  const askDelete = (tx: MonthlyBreakdown['transactions'][number]) => {
    if (tx.instalment_plan_id) {
      setCuotaConfirm({ txId: tx.id, planId: tx.instalment_plan_id })
      onConfirmOpenChange?.(true)
    } else {
      setConfirmId(tx.id)
      onConfirmOpenChange?.(true)
    }
  }

  const cancelDelete = () => {
    setConfirmId(null)
    setCuotaConfirm(null)
    onConfirmOpenChange?.(false)
  }

  const handleDelete = async () => {
    if (!onDelete || !confirmId) return
    const id = confirmId
    setConfirmId(null)
    onConfirmOpenChange?.(false)
    setDeletingId(id)
    try { await onDelete(id) } finally { setDeletingId(null) }
  }

  const handleDeleteCuota = async () => {
    if (!onDelete || !cuotaConfirm) return
    const { txId } = cuotaConfirm
    setCuotaConfirm(null)
    onConfirmOpenChange?.(false)
    setDeletingId(txId)
    try { await onDelete(txId) } finally { setDeletingId(null) }
  }

  const handleCancelPlan = async () => {
    if (!cuotaConfirm) return
    const { planId } = cuotaConfirm
    setCuotaConfirm(null)
    onConfirmOpenChange?.(false)
    try {
      await cancelInstalmentPlan(planId)
      await invalidateFinancialData(queryClient)
    } catch { /* error silencioso — el usuario puede reintentar */ }
  }

  const filtered = useMemo(() => {
    let result = filter === 'all' ? transactions : transactions.filter(t => t.type === filter)
    if (methodFilter !== 'all') {
      result = result.filter(t => t.metodo_pago === methodFilter)
    }
    if (internalCategory) {
      result = result.filter(t => t.category_name === internalCategory)
    }
    if (amountFilter.trim()) {
      result = result.filter(t => String(Math.round(t.amount)).includes(amountFilter.trim()))
    }
    if (search.trim()) {
      const q = search.toLowerCase()
      result = result.filter(t =>
        t.concept_name.toLowerCase().includes(q) ||
        t.category_name.toLowerCase().includes(q) ||
        (t.description?.toLowerCase().includes(q))
      )
    }
    return result
  }, [transactions, filter, methodFilter, internalCategory, amountFilter, search])

  // Summary totals by payment method (expenses only)
  const expenseTotals = useMemo(() => {
    const totals: Partial<Record<PaymentMethod, number>> = {}
    transactions.forEach(t => {
      if (t.type === 'expense' && t.metodo_pago) {
        const m = t.metodo_pago as PaymentMethod
        totals[m] = (totals[m] ?? 0) + t.amount
      }
    })
    return totals
  }, [transactions])

  const hasExpenses = transactions.some(t => t.type === 'expense')

  const handleTypeFilter = (f: typeof filter) => {
    setFilter(f)
    if (f !== 'expense' && f !== 'all') setMethodFilter('all')
  }

  const closeDropdown = () => setTimeout(() => setOpenDropdown(null), 150)

  const TYPE_OPTIONS = [
    { value: 'all',      label: 'Todos',           activeClass: 'bg-slate-700 border-slate-600 text-slate-200' },
    { value: 'income',   label: 'Ingresos',         activeClass: 'bg-cyan-500/15 border-cyan-500/30 text-cyan-400' },
    { value: 'expense',  label: 'Gastos',           activeClass: 'bg-rose-500/15 border-rose-500/30 text-rose-400' },
    { value: 'transfer', label: 'Transferencias',   activeClass: 'bg-amber-500/15 border-amber-500/30 text-amber-400' },
  ] as const

  const selectedTypeLabel = TYPE_OPTIONS.find(o => o.value === filter)?.label ?? 'Todos'
  const selectedTypeActive = TYPE_OPTIONS.find(o => o.value === filter)?.activeClass ?? ''

  const hasActiveFilters = filter !== 'all' || internalCategory || methodFilter !== 'all' || search.trim() || amountFilter.trim()

  const clearAll = () => {
    setFilter('all')
    setInternalCategory(null)
    setMethodFilter('all')
    setSearch('')
    setAmountFilter('')
  }

  return (
    <div>
      {/* Dropdown filters row */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">

        {/* Tipo */}
        <div className="relative">
          <button
            onClick={() => setOpenDropdown(openDropdown === 'tipo' ? null : 'tipo')}
            onBlur={closeDropdown}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              filter !== 'all' ? selectedTypeActive : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
            }`}
          >
            Tipo
            {filter !== 'all' && <span className="opacity-75">· {selectedTypeLabel}</span>}
            <ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />
          </button>
          {openDropdown === 'tipo' && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-xl min-w-[160px] py-1 overflow-hidden">
              {TYPE_OPTIONS.map(opt => (
                <button
                  key={opt.value}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { handleTypeFilter(opt.value as typeof filter); setOpenDropdown(null) }}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-slate-700 flex items-center justify-between ${
                    filter === opt.value ? 'font-semibold text-slate-200' : 'text-slate-400'
                  }`}
                >
                  {opt.label}
                  {filter === opt.value && <span className="text-emerald-400 text-[10px]">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Categoría */}
        <div className="relative">
          <button
            onClick={() => setOpenDropdown(openDropdown === 'categoria' ? null : 'categoria')}
            onBlur={closeDropdown}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
              internalCategory
                ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400'
                : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
            }`}
          >
            Categoría
            {internalCategory && <span className="opacity-75">· {internalCategory}</span>}
            <ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />
          </button>
          {openDropdown === 'categoria' && (
            <div className="absolute top-full left-0 mt-1 z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-xl min-w-[180px] py-1 overflow-hidden max-h-52 overflow-y-auto">
              <button
                onMouseDown={e => e.preventDefault()}
                onClick={() => { setInternalCategory(null); setOpenDropdown(null) }}
                className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-slate-700 flex items-center justify-between ${
                  !internalCategory ? 'font-semibold text-slate-200' : 'text-slate-400'
                }`}
              >
                Todas
                {!internalCategory && <span className="text-emerald-400 text-[10px]">✓</span>}
              </button>
              {availableCategories.map(cat => (
                <button
                  key={cat}
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { setInternalCategory(cat); setOpenDropdown(null) }}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-slate-700 flex items-center justify-between ${
                    internalCategory === cat ? 'font-semibold text-indigo-300' : 'text-slate-400'
                  }`}
                >
                  {cat}
                  {internalCategory === cat && <span className="text-emerald-400 text-[10px]">✓</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Método de Pago */}
        {hasExpenses && (
          <div className="relative">
            <button
              onClick={() => setOpenDropdown(openDropdown === 'metodo' ? null : 'metodo')}
              onBlur={closeDropdown}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                methodFilter !== 'all'
                  ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
              }`}
            >
              Método de Pago
              {methodFilter !== 'all' && <span className="opacity-75">· {PAYMENT_METHOD_LABELS[methodFilter as PaymentMethod]}</span>}
              <ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />
            </button>
            {openDropdown === 'metodo' && (
              <div className="absolute top-full left-0 mt-1 z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-xl min-w-[180px] py-1 overflow-hidden">
                <button
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => { setMethodFilter('all'); setOpenDropdown(null) }}
                  className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-slate-700 flex items-center justify-between ${
                    methodFilter === 'all' ? 'font-semibold text-slate-200' : 'text-slate-400'
                  }`}
                >
                  Todos
                  {methodFilter === 'all' && <span className="text-emerald-400 text-[10px]">✓</span>}
                </button>
                {ALL_PAYMENT_METHODS.filter(m => expenseTotals[m] !== undefined).map(m => (
                  <button
                    key={m}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { setMethodFilter(m); setOpenDropdown(null) }}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-slate-700 flex items-center justify-between ${
                      methodFilter === m ? 'font-semibold text-indigo-300' : 'text-slate-400'
                    }`}
                  >
                    <span>
                      {PAYMENT_METHOD_LABELS[m]}
                      {!privacy && <span className="ml-1.5 opacity-50">${Math.round(expenseTotals[m]!).toLocaleString()}</span>}
                    </span>
                    {methodFilter === m && <span className="text-emerald-400 text-[10px]">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Monto */}
        <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border bg-slate-800 border-slate-700">
          <span className="text-slate-500 shrink-0">Monto:</span>
          <input
            type="number"
            value={amountFilter}
            onChange={e => setAmountFilter(e.target.value)}
            placeholder="—"
            className="w-16 bg-transparent text-slate-300 outline-none placeholder:text-slate-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
          />
          {amountFilter && (
            <button onClick={() => setAmountFilter('')} className="text-slate-600 hover:text-slate-400">
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* Limpiar */}
        {hasActiveFilters && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20"
          >
            <X className="w-3 h-3" />
            Limpiar
          </button>
        )}

        <span className="ml-auto text-sm text-slate-600 self-center">{filtered.length} movimientos</span>
      </div>

      {/* Búsqueda */}
      <div className="relative mb-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Buscar por concepto, categoría, descripción..."
          className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-9 pr-4 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500/60 transition-colors placeholder:text-slate-600"
        />
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-600 pointer-events-none" />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400">
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {/* Table */}
      <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 320 }}>
        {filtered.length === 0 ? (
          <p className="text-slate-600 text-sm text-center py-8">Sin movimientos</p>
        ) : (
          <table className="w-full text-xs">
            <thead>
              <tr className="text-slate-600 uppercase text-sm">
                <th className="text-left pb-2 pl-1">Fecha</th>
                <th className="text-left pb-2">Categoría · Concepto</th>
                <th className="text-left pb-2 hidden lg:table-cell">Descripción</th>
                <th className="text-left pb-2 hidden sm:table-cell">Cuenta</th>
                <th className="text-left pb-2 hidden md:table-cell">Método</th>
                <th className="text-right pb-2 pr-1">Monto</th>
                <th className="pb-2 pr-3 w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/50">
              {filtered.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-2 pl-1 text-slate-500 whitespace-nowrap">{fmtDate(tx.date)}</td>
                  <td className="py-2">
                    <div className="flex items-center gap-1.5 leading-tight">
                      <p className="text-slate-300 font-medium">
                        {tx.type === 'transfer' && tx.transfer_dest_name
                          ? `→ ${tx.transfer_dest_name}`
                          : tx.category_name}
                      </p>
                      {tx.instalment_plan_id && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-xs font-semibold bg-blue-500/15 text-blue-400 border border-blue-500/20 shrink-0">
                          CUOTA
                        </span>
                      )}
                    </div>
                    <p className="text-slate-600">{tx.concept_name}</p>
                  </td>
                  <td className="py-2 text-slate-500 hidden lg:table-cell max-w-[180px] truncate">{tx.description}</td>
                  <td className="py-2 text-slate-500 hidden sm:table-cell">{tx.account_name}</td>
                  <td className="py-2 hidden md:table-cell">
                    {tx.type === 'expense' && tx.metodo_pago && (
                      <PaymentBadge method={tx.metodo_pago as PaymentMethod} />
                    )}
                  </td>
                  <td className={`py-2 pr-1 text-right font-semibold tabular-nums ${
                    tx.type === 'income' ? 'text-cyan-400' : tx.type === 'transfer' ? 'text-amber-400' : 'text-rose-400'
                  }`}>
                    {tx.type === 'income' ? '+' : tx.type === 'transfer' ? '→' : '-'}{fmtMoney(tx.amount, currency, privacy)}
                  </td>
                  <td className="py-2 pr-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {onEdit && (
                        <button
                          onClick={() => onEdit(tx.id)}
                          className="p-1 text-slate-700 hover:text-emerald-400 transition-colors"
                          title="Editar"
                        >
                          <Pencil className="w-3 h-3" />
                        </button>
                      )}
                      {onDelete && (
                        <button
                          onClick={() => askDelete(tx)}
                          disabled={deletingId === tx.id}
                          className="p-1 text-slate-700 hover:text-red-400 transition-colors disabled:opacity-40"
                        >
                          {deletingId === tx.id
                            ? <span className="text-xs">…</span>
                            : <span className="text-xs font-bold">✕</span>}
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ConfirmDialog
        open={confirmId !== null}
        title="Eliminar movimiento"
        message="Esta acción no se puede deshacer. ¿Confirmás que querés eliminar este movimiento?"
        confirmLabel="Eliminar"
        danger
        onConfirm={handleDelete}
        onCancel={cancelDelete}
      />

      {/* Diálogo especial para cuotas */}
      {cuotaConfirm !== null && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={cancelDelete} />
          <div className="relative z-10 bg-slate-900 border border-slate-700/80 rounded-2xl p-6 shadow-2xl w-full max-w-sm mx-4">
            <button onClick={cancelDelete} className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition-colors">
              <X className="w-4 h-4" />
            </button>
            <div className="flex items-start gap-3 mb-5">
              <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-blue-500/15">
                <CreditCard className="w-5 h-5 text-blue-400" />
              </div>
              <div className="pt-0.5">
                <h3 className="text-white font-semibold text-sm leading-snug">Cuota de plan de pagos</h3>
                <p className="text-slate-400 text-sm mt-1 leading-relaxed">
                  Esta transacción pertenece a un plan de cuotas. ¿Qué querés hacer?
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={handleDeleteCuota}
                className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-red-500/20 hover:bg-red-500/30 border border-red-500/30 rounded-xl transition-colors text-left"
              >
                Eliminar solo esta cuota
                <p className="text-sm font-normal text-slate-400 mt-0.5">Revierte el monto de esta cuota y elimina el movimiento.</p>
              </button>
              <button
                onClick={handleCancelPlan}
                className="w-full px-4 py-2.5 text-sm font-semibold text-white bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/30 rounded-xl transition-colors text-left"
              >
                Cancelar el plan entero
                <p className="text-sm font-normal text-slate-400 mt-0.5">Revierte todas las cuotas futuras y cancela el plan.</p>
              </button>
              <button
                onClick={cancelDelete}
                className="w-full px-4 py-2 text-sm text-slate-400 hover:text-slate-200 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function StatsDashboardPage() {
  const navigate = useNavigate()

  const today = new Date()
  const [year,         setYear]         = useState(today.getFullYear())
  const [month,        setMonth]        = useState(today.getMonth() + 1)
  const [privacy,      setPrivacy]      = useState(() => localStorage.getItem('privacy') === 'true')
  const [currency,     setCurrency]     = useState('UYU')
  const [settingsOpen,      setSettingsOpen]      = useState(false)
  const [txModalOpen,       setTxModalOpen]       = useState(false)
  const [editTxId,          setEditTxId]          = useState<string | undefined>(undefined)
  const [voiceOpen,         setVoiceOpen]         = useState(false)
  const [txConfirmOpen,     setTxConfirmOpen]     = useState(false)
  const [selectedCategory,  setSelectedCategory]  = useState<string | null>(null)
  const [donutMode,         setDonutMode]         = useState<'expense' | 'income'>('expense')
  const [openHeaderDd,      setOpenHeaderDd]      = useState<'mes' | 'año' | 'moneda' | null>(null)
  const closeHeaderDd = () => setTimeout(() => setOpenHeaderDd(null), 150)

  const queryClient = useQueryClient()

  useEffect(() => { setSelectedCategory(null) }, [year, month])

  const { data: me } = useQuery({
    queryKey: ['me'],
    queryFn:  fetchMe,
  })

  useEffect(() => {
    if (me?.currency_default) setCurrency(me.currency_default)
  }, [me?.currency_default])

  const { data: breakdown, isLoading } = useQuery({
    queryKey: ['monthly-breakdown', year, month, currency],
    queryFn: () => fetchMonthlyBreakdown(year, month, currency),
  })

  const prevMonthYear = month === 1 ? year - 1 : year
  const prevMonthNum  = month === 1 ? 12 : month - 1
  const { data: prevBreakdown } = useQuery({
    queryKey: ['monthly-breakdown', prevMonthYear, prevMonthNum, currency],
    queryFn:  () => fetchMonthlyBreakdown(prevMonthYear, prevMonthNum, currency),
  })

  const { data: summary } = useQuery({
    queryKey: ['summary'],
    queryFn: fetchSummary,
  })

  function prevMonth() {
    if (month === 1) { setYear(y => y - 1); setMonth(12) }
    else setMonth(m => m - 1)
  }
  function nextMonth() {
    const maxDate = new Date(today.getFullYear() + 2, today.getMonth(), 1)
    const currentDate = new Date(year, month - 1, 1)
    if (currentDate >= maxDate) return
    if (month === 12) { setYear(y => y + 1); setMonth(1) }
    else setMonth(m => m + 1)
  }

  const maxYear = today.getFullYear() + 2
  const isMaxMonth = year > maxYear || (year === maxYear && month >= today.getMonth() + 1)

  // Summary cards data
  const income   = breakdown?.income   ?? 0
  const expenses = breakdown?.expenses ?? 0
  const savings  = breakdown?.savings  ?? 0
  const savingsRate = income > 0 ? (savings / income) * 100 : 0

  return (
    <>
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-4 lg:p-8 selection:bg-emerald-500/30">

      {/* NAV TABS */}
      <nav className="flex gap-1.5 mb-4 overflow-x-auto [scrollbar-width:none] pb-0.5">
        <button
          onClick={() => navigate('/')}
          className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent transition-colors"
        >
          <Activity className="w-4 h-4" /><span className="hidden sm:inline">Análisis Global</span>
        </button>
        <button className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
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
      <header className="relative z-20 flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 sm:mb-6 gap-4 bg-slate-900/50 p-4 rounded-2xl border border-slate-800/50 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-gradient-to-br from-indigo-400 to-violet-500 rounded-xl flex items-center justify-center">
            <BarChart2 className="text-white w-5 h-5" />
          </div>
          <div>
            <p className="text-sm font-bold text-white">Análisis detallado · {MONTH_NAMES[month - 1]} {year}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          {/* Month + Year selector */}
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5">
            <button onClick={() => { setOpenHeaderDd(null); prevMonth() }} className="p-1 text-slate-400 hover:text-slate-200 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Mes */}
            <div className="relative">
              <button
                onClick={() => setOpenHeaderDd(openHeaderDd === 'mes' ? null : 'mes')}
                onBlur={closeHeaderDd}
                className="flex items-center gap-0.5 text-sm font-semibold text-slate-200 px-1 py-0.5 rounded-lg hover:bg-slate-800 transition-colors"
              >
                {MONTH_NAMES[month - 1]}
                <ChevronDown className="w-3 h-3 opacity-50" />
              </button>
              {openHeaderDd === 'mes' && (
                <div className="absolute top-full left-0 mt-1 z-[200] bg-slate-900 border border-slate-700 rounded-xl shadow-xl min-w-[130px] py-1 overflow-hidden max-h-60 overflow-y-auto">
                  {MONTH_NAMES.map((name, i) => (
                    <button
                      key={i + 1}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { setMonth(i + 1); setOpenHeaderDd(null) }}
                      className={`w-full text-left px-3 py-1.5 text-xs transition-colors hover:bg-slate-700 flex items-center justify-between ${month === i + 1 ? 'font-semibold text-slate-200' : 'text-slate-400'}`}
                    >
                      {name}
                      {month === i + 1 && <span className="text-emerald-400 text-[10px]">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Año */}
            <div className="relative">
              <button
                onClick={() => setOpenHeaderDd(openHeaderDd === 'año' ? null : 'año')}
                onBlur={closeHeaderDd}
                className="flex items-center gap-0.5 text-sm font-semibold text-slate-200 px-1 py-0.5 rounded-lg hover:bg-slate-800 transition-colors"
              >
                {year}
                <ChevronDown className="w-3 h-3 opacity-50" />
              </button>
              {openHeaderDd === 'año' && (
                <div className="absolute top-full left-0 mt-1 z-[200] bg-slate-900 border border-slate-700 rounded-xl shadow-xl py-1 overflow-hidden">
                  {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 3 + i).map(y => (
                    <button
                      key={y}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { setYear(y); setOpenHeaderDd(null) }}
                      className={`w-full text-left px-4 py-1.5 text-xs transition-colors hover:bg-slate-700 flex items-center justify-between gap-4 ${year === y ? 'font-semibold text-slate-200' : 'text-slate-400'}`}
                    >
                      {y}
                      {year === y && <span className="text-emerald-400 text-[10px]">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => { setOpenHeaderDd(null); nextMonth() }} disabled={isMaxMonth} className="p-1 text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-30">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Privacy */}
          <button onClick={() => { setPrivacy(p => { localStorage.setItem('privacy', String(!p)); return !p }) }}
            className="p-2 text-slate-400 hover:text-indigo-400 bg-slate-950 border border-slate-800 rounded-lg transition-colors">
            {privacy ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>

          {/* Moneda */}
          <div className="relative">
            <button
              onClick={() => setOpenHeaderDd(openHeaderDd === 'moneda' ? null : 'moneda')}
              onBlur={closeHeaderDd}
              className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5"
            >
              <DollarSign className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-medium text-slate-300">{currency}</span>
              <ChevronDown className="w-3 h-3 text-slate-500" />
            </button>
            {openHeaderDd === 'moneda' && (
              <div className="absolute top-full right-0 mt-1 z-[200] bg-slate-900 border border-slate-700 rounded-xl shadow-xl py-1 overflow-hidden min-w-[100px]">
                {[...new Set([me?.currency_default ?? 'UYU', 'USD', 'EUR'])].map(c => (
                  <button
                    key={c}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { setCurrency(c); setOpenHeaderDd(null) }}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-slate-700 flex items-center justify-between gap-3 ${currency === c ? 'font-semibold text-slate-200' : 'text-slate-400'}`}
                  >
                    {c}
                    {currency === c && <span className="text-emerald-400 text-[10px]">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Settings */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 text-slate-400 hover:text-indigo-400 bg-slate-950 border border-slate-800 rounded-lg transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>

          {breakdown && (
            <ExportButton
              onExport={() => exportMonthlyPDF({ breakdown, year, month, currency, userName: me?.name })}
            />
          )}
        </div>
      </header>

      {/* SUMMARY CARDS */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4 sm:mb-6">
        {([
          { label: 'Ingresos',  value: income,   prevValue: prevBreakdown?.income,   color: 'text-cyan-400',   icon: TrendingUp,   border: 'border-cyan-500/20',   bg: 'bg-cyan-500/10',    higherIsBetter: true  },
          { label: 'Gastos',    value: expenses, prevValue: prevBreakdown?.expenses, color: 'text-rose-400',   icon: TrendingDown, border: 'border-rose-500/20',   bg: 'bg-rose-500/10',    higherIsBetter: false },
          { label: 'Ahorro',    value: savings,  prevValue: prevBreakdown?.savings,  color: savings >= 0 ? 'text-emerald-400' : 'text-red-400',
            icon: savings >= 0 ? TrendingUp : TrendingDown,
            border: savings >= 0 ? 'border-emerald-500/20' : 'border-red-500/20',
            bg: savings >= 0 ? 'bg-emerald-500/10' : 'bg-red-500/10',             higherIsBetter: true  },
          { label: 'Tasa ahorro', value: null, prevValue: undefined, color: savingsRate >= 0 ? 'text-violet-400' : 'text-red-400',
            icon: TrendingUp, border: 'border-violet-500/20', bg: 'bg-violet-500/10',
            extra: privacy ? '**%' : `${savingsRate.toFixed(1)}%`,                 higherIsBetter: true  },
        ] as Array<{ label: string; value: number | null; prevValue: number | undefined; color: string; icon: React.ElementType; border: string; bg: string; higherIsBetter: boolean; extra?: string }>).map(({ label, value, prevValue, color, icon: Icon, border, bg, extra, higherIsBetter }) => {
          const delta = value != null && prevValue != null && prevValue > 0
            ? ((value - prevValue) / prevValue) * 100
            : null
          const deltaUp = delta != null && delta > 0
          return (
            <div key={label} className={`bg-slate-900/40 border ${border} rounded-2xl p-4 backdrop-blur-sm`}>
              <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center mb-3`}>
                <Icon className={`w-4 h-4 ${color}`} />
              </div>
              <p className="text-sm text-slate-500 uppercase font-bold tracking-widest mb-1">{label}</p>
              {isLoading ? (
                <div className="h-6 w-24 bg-slate-800 animate-pulse rounded" />
              ) : (
                <>
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <p className={`text-lg font-bold ${color} tabular-nums`}>
                      {extra ?? fmtMoney(value!, currency, privacy)}
                    </p>
                  </div>
                  {!privacy && delta != null && Math.abs(delta) >= 0.5 && (
                    <div className="flex items-center gap-1 mt-0.5">
                      <span className={`text-xs font-bold ${
                        (higherIsBetter ? deltaUp : !deltaUp) ? 'text-emerald-400' : 'text-rose-400'
                      }`}>
                        {deltaUp ? '↑' : '↓'}{Math.abs(delta).toFixed(1)}%
                      </span>
                      <span className="text-[10px] text-slate-600">vs {MONTH_NAMES[prevMonthNum - 1]}</span>
                    </div>
                  )}
                </>
              )}
            </div>
          )
        })}
      </div>

      {/* ROW 1: Estado · Donut + Categorías · Heatmap */}
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-3 lg:gap-6 mb-4 sm:mb-6">

        {/* Estado de Cuentas — 1/4 */}
        <div className="bg-slate-900/40 border border-slate-800/50 rounded-3xl p-5 backdrop-blur-sm flex flex-col gap-4">
          <div>
            <h2 className="text-sm font-semibold text-slate-200">Estado de Cuentas</h2>
            <p className="text-sm text-slate-500 mt-0.5">{MONTH_NAMES[month - 1]} {year}</p>
          </div>

          {/* Cuentas */}
          <div className="flex-1 space-y-1.5">
            <p className="text-xs text-slate-600 uppercase tracking-widest mb-1">Desglose por Cuenta</p>
            {(summary?.accounts ?? []).length === 0 ? (
              <p className="text-sm text-slate-600">Sin cuentas registradas</p>
            ) : (summary?.accounts ?? []).map(acc => {
              const isCredit = acc.type === 'credit'
              const iconBg: Record<string, string> = {
                cash: 'text-emerald-400 bg-emerald-400/10',
                debit: 'text-cyan-400 bg-cyan-400/10',
                credit: 'text-rose-400 bg-rose-400/10',
                investment: 'text-violet-400 bg-violet-400/10',
              }
              const typeDesc: Record<string, string> = {
                cash: 'Efectivo', debit: 'Débito',
                credit: 'Crédito', investment: 'Inversión',
              }
              return (
                <div key={acc.id}
                  className="flex items-center gap-2 bg-slate-800/30 rounded-xl px-2.5 py-2">
                  <div className={`p-1.5 rounded-lg shrink-0 ${iconBg[acc.type] ?? 'text-slate-400 bg-slate-800'}`}>
                    {acc.type === 'cash'       ? <Wallet     className="w-3.5 h-3.5" /> :
                     acc.type === 'investment' ? <TrendingUp className="w-3.5 h-3.5" /> :
                                                 <CreditCard className="w-3.5 h-3.5" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-200 truncate">{acc.name}</p>
                    <p className="text-xs text-slate-500">{typeDesc[acc.type] ?? 'Cuenta'}</p>
                  </div>
                  <span className={`text-sm font-bold tabular-nums shrink-0 ${isCredit || acc.balance < 0 ? 'text-rose-400' : 'text-slate-200'}`}>
                    {fmtMoney(acc.balance, acc.currency, privacy)}
                  </span>
                </div>
              )
            })}
          </div>
        </div>

        {/* Donut + Categories — 2/4 */}
        <div id="fluxo-export-distribution" className="lg:col-span-2 bg-slate-900/40 border border-slate-800/50 rounded-2xl sm:rounded-3xl p-4 sm:p-6 backdrop-blur-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <div className="flex items-center gap-1 p-0.5 bg-slate-800/60 border border-slate-700/50 rounded-xl mb-1.5">
                <button
                  onClick={() => { setDonutMode('expense'); setSelectedCategory(null) }}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    donutMode === 'expense'
                      ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Gastos
                </button>
                <button
                  onClick={() => { setDonutMode('income'); setSelectedCategory(null) }}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                    donutMode === 'income'
                      ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                      : 'text-slate-500 hover:text-slate-300'
                  }`}
                >
                  Ingresos
                </button>
              </div>
              <p className="text-xs text-slate-500">Por categoría · {MONTH_NAMES[month - 1]} {year}</p>
            </div>
            {donutMode === 'expense' && (
              <div className="flex items-center gap-1.5">
                <div className="w-px h-3 bg-slate-500/60 rounded-full" />
                <span className="text-sm text-slate-600">Umbral 30%</span>
              </div>
            )}
          </div>

          {isLoading ? (
            <div className="h-48 bg-slate-800/50 animate-pulse rounded-xl" />
          ) : (() => {
            const cats = donutMode === 'expense' ? breakdown?.categories : breakdown?.income_categories
            const total = donutMode === 'expense' ? (breakdown?.expenses ?? 0) : (breakdown?.income ?? 0)
            if (!breakdown || !cats || cats.length === 0) return (
              <div className="h-48 flex items-center justify-center">
                <p className="text-slate-600 text-sm">
                  {donutMode === 'expense' ? 'Sin gastos en este mes' : 'Sin ingresos en este mes'}
                </p>
              </div>
            )
            return (
              <div className="flex gap-5 items-start">
                <DonutChart
                  data={{ ...breakdown, categories: cats, income: total }}
                  privacy={privacy}
                  selectedCategory={selectedCategory}
                  onCategoryClick={setSelectedCategory}
                  mode={donutMode}
                />
                <div className="flex-1 min-w-0 space-y-3 overflow-y-auto" style={{ maxHeight: 244 }}>
                  {cats.map((cat: CategoryStat, i: number) => {
                    const pct = total > 0 ? (cat.total / total) * 100 : 0
                    const sem = donutMode === 'expense' ? semColor(cat.total / (breakdown.income || 1) * 100) : { badge: 'bg-emerald-500/15 text-emerald-400', bar: '#10b981' }
                    return (
                      <div key={cat.name}>
                        <div className="flex items-center gap-2 mb-1.5">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: catColor(i) }} />
                          <span className="text-sm text-slate-300 flex-1 truncate">{cat.name}</span>
                          <span className="text-sm font-semibold text-slate-300 tabular-nums">
                            {fmtMoney(cat.total, currency, privacy)}
                          </span>
                          <span className={`text-sm px-1.5 py-0.5 rounded-full font-semibold ${sem.badge}`}>
                            {pct.toFixed(0)}%
                          </span>
                        </div>
                        <div className="relative">
                          <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                            <div className="h-full rounded-full transition-all duration-700"
                              style={{ width: `${Math.min(pct, 100)}%`, background: sem.bar }} />
                          </div>
                          {donutMode === 'expense' && (
                            <div className="absolute top-[-3px] w-px h-[15px] bg-slate-500/60 rounded-full pointer-events-none"
                              style={{ left: '30%' }} title="Umbral recomendado: 30% del ingreso" />
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}
        </div>

        {/* Heatmap — 1/3, compacto */}
        <div id="fluxo-export-heatmap" className="bg-slate-900/40 border border-slate-800/50 rounded-3xl p-4 backdrop-blur-sm">
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-slate-200">Mapa de Gastos</h2>
            <p className="text-sm text-slate-500 mt-0.5">Intensidad diaria</p>
          </div>
          {isLoading ? (
            <div className="h-44 bg-slate-800/50 animate-pulse rounded-xl" />
          ) : (
            <ExpenseHeatmap
              year={year}
              month={month}
              dailyExpenses={breakdown?.daily_expenses ?? []}
              privacy={privacy}
            />
          )}
        </div>
      </div>

      {/* ROW 2: Historial — full width */}
      <div className="bg-slate-900/40 border border-slate-800/50 rounded-2xl sm:rounded-3xl p-4 sm:p-6 backdrop-blur-sm mb-24">
        <h2 className="text-sm font-semibold text-slate-200 mb-4">Historial de Movimientos</h2>
        {isLoading ? (
          <div className="space-y-2">
            {[1,2,3,4].map(i => <div key={i} className="h-10 bg-slate-800/50 animate-pulse rounded-lg" />)}
          </div>
        ) : !breakdown || breakdown.transactions.length === 0 ? (
          <p className="text-slate-600 text-sm text-center py-8">Sin movimientos en este mes</p>
        ) : (
          <TxTable
            transactions={breakdown.transactions}
            privacy={privacy}
            currency={currency}
            categoryFilter={selectedCategory}
            onConfirmOpenChange={setTxConfirmOpen}
            onEdit={id => { setEditTxId(id); setTxModalOpen(true) }}
            onDelete={async (id) => {
              await deleteTransaction(id)
              await invalidateFinancialData(queryClient)
            }}
          />
        )}
      </div>
    </div>

    {!txConfirmOpen && (
      <>
        <button
          onClick={() => setVoiceOpen(true)}
          title="Registrar con voz"
          className="fixed bottom-24 right-7 z-30 w-11 h-11 bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-emerald-500/50 text-emerald-400 rounded-2xl shadow-lg flex items-center justify-center transition-all active:scale-95 hover:scale-105"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
        </button>
        <FAB onClick={() => { setEditTxId(undefined); setTxModalOpen(true) }} />
      </>
    )}
    <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    <TransactionModal
      open={txModalOpen}
      editTxId={editTxId}
      onClose={() => { setTxModalOpen(false); setEditTxId(undefined) }}
    />
    <VoiceExpenseModal open={voiceOpen} onClose={() => setVoiceOpen(false)} />
    </>
  )
}
