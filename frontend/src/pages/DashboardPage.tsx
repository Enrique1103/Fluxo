import { useState, useMemo, useRef, useEffect, useCallback } from 'react'
import useTheme from '../hooks/useTheme'
import { useQuery, useQueryClient, keepPreviousData } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import {
  Settings, Eye, EyeOff,
  Activity, DollarSign, ChevronDown,
  Lock, LockOpen, BarChart2,
  Edit3, Trash2, Plus, Loader2,
  Wallet, TrendingUp, Upload, Home,
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
  type FinGoal,
} from '../api/dashboard'
import SettingsDrawer, { type Section as SettingsSection } from '../components/SettingsDrawer'
import GoalModal from '../components/GoalModal'
import ConfirmDialog from '../components/ConfirmDialog'
import TransactionModal from '../components/TransactionModal'
import VoiceExpenseModal from '../components/VoiceExpenseModal'
import ExportButton from '../components/ExportButton'
import { exportGlobalPDF } from '../lib/exportPDF'
import MonthlyChart, { fmtMoney, ChartWaveCanvas } from '../components/MonthlyChart'
import PatrimonioChart from '../components/PatrimonioChart'

// ─── helpers ────────────────────────────────────────────────────────────────

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

function goalColor(idx: number) {
  const colors = ['bg-cyan-400', 'bg-emerald-400', 'bg-indigo-400', 'bg-amber-400', 'bg-rose-400']
  return colors[idx % colors.length]
}

// ─── Page ────────────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const [privacyMode,   setPrivacyMode]   = useState(() => localStorage.getItem('privacy') === 'true')
  const [currency,      setCurrency]      = useState('UYU') // synced to home currency below
  const [openCurrencyDd, setOpenCurrencyDd] = useState(false)
  const closeCurrencyDd = () => setTimeout(() => setOpenCurrencyDd(false), 150)
  const [settingsOpen,    setSettingsOpen]    = useState(false)
  const [settingsSection, setSettingsSection] = useState<SettingsSection>(null)
  const [goalModalOpen,    setGoalModalOpen]    = useState(false)
  const [editGoal,         setEditGoal]         = useState<FinGoal | undefined>(undefined)
  const [txModalOpen,      setTxModalOpen]      = useState(false)
  const [voiceOpen,        setVoiceOpen]        = useState(false)
  const [confirmDeleteGoalId, setConfirmDeleteGoalId] = useState<string | null>(null)
  const [deletingGoalId,   setDeletingGoalId]   = useState<string | null>(null)
  const [monthsAhead,   setMonthsAhead]   = useState(24)
  const [runwayYears,   setRunwayYears]   = useState(1)
  const [runwayPickerOpen, setRunwayPickerOpen] = useState(false)
  const [customYears,  setCustomYears]  = useState('')
  const [customMonths, setCustomMonths] = useState('')
  const runwayPickerRef = useRef<HTMLDivElement>(null)
  const loadMoreInProgress = useRef(false)

  const { data: summary, isLoading: summaryLoading } = useQuery({
    queryKey: ['summary', currency],
    queryFn:  () => fetchSummary(currency),
    placeholderData: keepPreviousData,
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

  useEffect(() => { if (me?.currency_default) setCurrency(me.currency_default) }, [me?.currency_default])

  const { data: patrimonioData = [], isLoading: patrimonioLoading, isError: patrimonioError } = useQuery({
    queryKey: ['patrimonio', monthsBack, monthsAhead, currency],
    queryFn:  () => fetchPatrimonio(monthsBack, monthsAhead, currency),
    enabled:  !!me,
    placeholderData: keepPreviousData,
    retry: 1,
  })

  const { data: exchangeRates = [] } = useQuery({
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
    const todayLabel = new Date().toISOString().slice(0, 7)
    const closed = chartData
      .filter(d => d.month < todayLabel && (d.ingresos > 0 || d.gastos > 0))
      .slice(-3)
    if (closed.length > 0) {
      const avg         = closed.reduce((s, d) => s + d.ahorro, 0) / closed.length
      const avgExpenses = closed.reduce((s, d) => s + d.gastos, 0) / closed.length
      return { avg, avgExpenses, count: closed.length, usingCurrent: false }
    }
    const current = chartData.find(d => d.month === todayLabel)
    if (current && (current.ingresos > 0 || current.gastos > 0)) {
      return { avg: current.ahorro, avgExpenses: current.gastos, count: 0, usingCurrent: true }
    }
    return { avg: 0, avgExpenses: 0, count: 0, usingCurrent: false }
  }, [chartData])

  const avgMonthlySavings = closedMonthsStats.avg

  // Libertad Financiera
  const runway = useMemo(() => {
    const todayLabel  = new Date().toISOString().slice(0, 7)
    // Usar patrimonioData para net worth (tiene keepPreviousData → estable al cambiar moneda)
    const netWorth    = patrimonioData.find(p => p.month === todayLabel)?.value
      ?? Number(summary?.net_worth ?? 0)
    const closedCount = closedMonthsStats.count

    // Promedio de gastos: últimos 6 meses cerrados (o menos si no hay);
    // si no hay historial, usa el mes actual en curso (currency-safe via chartData)
    const currentMonthGastos = chartData.find(d => d.month === todayLabel)?.gastos
      ?? Number(summary?.expense_this_month ?? 0)
    const baseExpenses = closedCount > 0 ? closedMonthsStats.avgExpenses : currentMonthGastos

    if (baseExpenses <= 0) return { months: 0, days: 0, pct: 0, monthsToTarget: null as number | null, closedCount, baseExpenses: 0 }

    const raw    = netWorth / baseExpenses
    const months = Math.floor(raw)
    const days   = Math.round((raw - months) * 30)
    const pct    = Math.min((raw / (runwayYears * 12)) * 100, 100)

    const targetNW = runwayYears * 12 * baseExpenses
    let monthsToTarget: number | null = null
    if (netWorth >= targetNW) {
      monthsToTarget = 0
    } else if (avgMonthlySavings > 0) {
      monthsToTarget = (targetNW - netWorth) / avgMonthlySavings
    }

    return { months, days, pct, monthsToTarget, closedCount, baseExpenses, usingCurrent: closedMonthsStats.usingCurrent }
  }, [summary, runwayYears, avgMonthlySavings, closedMonthsStats, chartData])

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
      <header className="relative z-20 flex flex-col md:flex-row justify-between items-start md:items-center mb-4 sm:mb-8 gap-3 bg-slate-900/50 p-4 rounded-2xl border border-slate-800/50 backdrop-blur-md">
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
          <button onClick={() => { setPrivacyMode(p => { localStorage.setItem('privacy', String(!p)); return !p }) }}
            className="p-2 text-slate-400 hover:text-emerald-400 bg-slate-950 border border-slate-800 rounded-lg transition-colors">
            {privacyMode ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>

          <div className="relative">
            <button
              onClick={() => setOpenCurrencyDd(v => !v)}
              onBlur={closeCurrencyDd}
              className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2"
            >
              <DollarSign className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-medium text-slate-300">{currency}</span>
              <ChevronDown className="w-3 h-3 text-slate-500" />
            </button>
            {openCurrencyDd && (
              <div className="absolute top-full right-0 mt-1 z-[200] bg-slate-900 border border-slate-700 rounded-xl shadow-xl py-1 overflow-hidden min-w-[100px]">
                {[...new Set([me?.currency_default ?? 'UYU', 'USD', 'EUR'])].map(c => (
                  <button
                    key={c}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { setCurrency(c); setOpenCurrencyDd(false) }}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-slate-700 flex items-center justify-between gap-3 ${currency === c ? 'font-semibold text-slate-200' : 'text-slate-400'}`}
                  >
                    {c}
                    {currency === c && <span className="text-emerald-400 text-[10px]">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>

          {summary && (
            <ExportButton
              onExport={() => exportGlobalPDF({
                netWorth:    Number(summary.net_worth),
                totalAssets: Number(summary.total_assets),
                totalDebt:   Number(summary.total_debt),
                income:      Number(summary.income_this_month),
                expenses:    Number(summary.expense_this_month),
                savings:     Number(summary.net_this_month),
                accounts:    summary.accounts.map(a => ({ name: a.name, type: a.type, balance: a.balance, currency: a.currency })),
                goals:       finGoals.map(g => ({ name: g.name, current: Number(g.current_amount ?? 0), target: Number(g.target_amount), deadline: g.deadline ?? undefined })),
                currency,
                userName: me?.name,
              })}
            />
          )}

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
              <>
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
                <p className="text-[10px] text-slate-600 mt-0.5">
                  {runway.closedCount > 0
                    ? `Basado en promedio de gastos de los últimos ${runway.closedCount} mes${runway.closedCount !== 1 ? 'es' : ''}`
                    : 'Basado en gastos del mes en curso'}
                </p>
              </>
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
          if (runway.closedCount === 0 && !runway.usingCurrent) return (
            <p className="text-[11px] text-slate-600 mt-2">
              Completá al menos un mes para estimar el plazo hacia tu objetivo.
            </p>
          )
          if (runway.monthsToTarget === null) return null
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
              <span className="text-[10px] text-slate-600 uppercase hidden sm:inline">mové el cursor para ver detalle</span>
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


        {/* Patrimonio + Cuentas */}
        <div className="space-y-4 sm:space-y-6">

          {/* Patrimonio Neto */}
          <PatrimonioChart data={patrimonioData} isLoading={patrimonioLoading} isError={patrimonioError} firstTxMonth={summary?.first_tx_month} privacy={privacyMode} currency={currency} netWorth={Number(summary?.net_worth ?? 0)} netWorthLoading={summaryLoading} />



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
                          : `${fmtMoney(current, goal.currency, false)} / ${fmtMoney(target, goal.currency, false)} · vas al `
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
                        if (closedMonthsStats.count === 0 && !closedMonthsStats.usingCurrent) return (
                          <p className="text-xs text-slate-400 mb-2">
                            Completá al menos un mes para estimar el plazo.
                          </p>
                        )
                        if (alloc === 0) return (
                          <p className="text-xs text-slate-400 mb-2">Sin flujo asignado — no es posible estimar el plazo.</p>
                        )
                        const monthlyContrib = avgMonthlySavings * alloc / 100
                        if (monthlyContrib <= 0) return null
                        let remaining = target - current
                        if (goal.currency !== currency) {
                          const rate = [...exchangeRates]
                            .filter(r =>
                              (r.from_currency === goal.currency && r.to_currency === currency) ||
                              (r.from_currency === currency && r.to_currency === goal.currency)
                            )
                            .sort((a, b) => a.year !== b.year ? b.year - a.year : b.month - a.month)[0]
                          if (!rate) return (
                            <p className="text-xs text-slate-500 mb-2">
                              Meta en {goal.currency} · configurá la tasa {goal.currency}/{currency} para estimar el plazo.
                            </p>
                          )
                          remaining = rate.from_currency === goal.currency
                            ? remaining * rate.rate
                            : remaining / rate.rate
                        }
                        const mths = remaining / monthlyContrib
                        const basedOnLabel = closedMonthsStats.usingCurrent
                          ? 'mes en curso'
                          : `${closedMonthsStats.count} mes${closedMonthsStats.count !== 1 ? 'es' : ''}`
                        return (
                          <p className="text-xs text-slate-400 mb-2">
                            A este ritmo,{' '}
                            <span className="text-slate-300 font-medium">{fmtDuration(mths)}</span>
                            {' '}para completar la meta
                            {(closedMonthsStats.count < 3 || closedMonthsStats.usingCurrent) && (
                              <span className="text-slate-500"> (basado en {basedOnLabel})</span>
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
      onClick={() => setVoiceOpen(true)}
      title="Registrar con voz"
      className="fixed bottom-24 right-6 z-30 w-11 h-11 bg-slate-800 hover:bg-slate-700 border border-slate-600 hover:border-emerald-500/50 text-emerald-400 rounded-2xl shadow-lg flex items-center justify-center transition-all active:scale-95 hover:scale-105"
    >
      <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" x2="12" y1="19" y2="22"/></svg>
    </button>
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
    <VoiceExpenseModal open={voiceOpen} onClose={() => setVoiceOpen(false)} />
    </>
  )
}

