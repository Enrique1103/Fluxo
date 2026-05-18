import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Activity, BarChart2, Upload, Home, Users, Plus, Copy, Check,
  Loader2, X, UserCheck, UserX, ArrowRight,
  AlertTriangle, Settings, Crown, Wallet, TrendingDown,
  Eye, EyeOff, ChevronLeft, ChevronRight, Search, ChevronDown, DollarSign,
} from 'lucide-react'
import { useHouseholdEvents } from '../hooks/useHouseholdEvents'
import { useAuthStore } from '../store/authStore'
import {
  fetchHouseholds, generateInvite, fetchMembers, approveMember, removeMember,
  fetchHouseholdAnalytics,
} from '../api/households'
import CategoryDonut from '../components/household/CategoryDonut'
import CreateModal from '../components/household/CreateModal'
import JoinModal from '../components/household/JoinModal'
import EditModal from '../components/household/EditModal'
import SettingsDrawer from '../components/SettingsDrawer'
import ExportButton from '../components/ExportButton'
import { exportHouseholdPDF } from '../lib/exportPDF'
import { useHomeCurrency } from '../hooks/useHomeCurrency'
import {
  MONTH_NAMES, DONUT_COLORS, avatarPalette, fmtNum,
  getUserIdFromToken, getMemberBreakdown, categoryColor,
} from '../components/household/household.utils'

export default function HouseholdPage() {
  const navigate  = useNavigate()
  const qc        = useQueryClient()

  const token         = useAuthStore((s) => s.token)
  const currentUserId = getUserIdFromToken(token)

  const homeCurrency = useHomeCurrency()
  const [privacy,      setPrivacy]      = useState(() => localStorage.getItem('privacy') === 'true')
  const [currency,     setCurrency]     = useState(homeCurrency)
  useEffect(() => { if (homeCurrency) setCurrency(homeCurrency) }, [homeCurrency])
  const [settingsOpen, setSettingsOpen] = useState(false)

  const [showCreate, setShowCreate] = useState(false)
  const [showJoin,   setShowJoin]   = useState(false)
  const [showEdit,   setShowEdit]   = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const [inviteCode,  setInviteCode]  = useState<string | null>(null)
  const [copied,      setCopied]      = useState(false)
  const [showInvite,  setShowInvite]  = useState(false)
  const [confirmRemoveId,  setConfirmRemoveId]  = useState<string | null>(null)
  const [filterMember,     setFilterMember]     = useState<string | null>(null)
  const [filterCategory,   setFilterCategory]   = useState<string | null>(null)
  const [filterSearch,     setFilterSearch]     = useState('')
  const [filterAmount,     setFilterAmount]     = useState('')
  const [openDropdown,     setOpenDropdown]     = useState<'miembro' | 'categoria' | 'mes' | 'año' | 'moneda' | null>(null)
  const closeDropdown = () => setTimeout(() => setOpenDropdown(null), 150)

  const [year,  setYear]  = useState(() => new Date().getFullYear())
  const [month, setMonth] = useState(() => new Date().getMonth() + 1)

  useHouseholdEvents()

  const { data: households = [], isLoading } = useQuery({
    queryKey: ['households'],
    queryFn:  fetchHouseholds,
  })

  const household = households.find(h => h.id === selectedId) ?? households[0] ?? null

  const { data: members = [] } = useQuery({
    queryKey: ['household-members', household?.id],
    queryFn:  () => fetchMembers(household!.id),
    enabled:  !!household,
  })

  const { data: analytics, isLoading: analyticsLoading, error: analyticsError } = useQuery({
    queryKey: ['household-analytics', household?.id, year, month],
    queryFn:  () => fetchHouseholdAnalytics(household!.id, year, month),
    enabled:  !!household,
    retry:    false,
  })

  const inviteMutation = useMutation({
    mutationFn: () => generateInvite(household!.id),
    onSuccess:  (inv) => { setInviteCode(inv.code); setShowInvite(true) },
  })

  const approveMutation = useMutation({
    mutationFn: (userId: string) => approveMember(household!.id, userId),
    onMutate: (userId: string) => {
      qc.setQueryData(
        ['household-members', household?.id],
        (old: typeof members) => old?.map(m => m.user_id === userId ? { ...m, status: 'active' as const } : m) ?? old,
      )
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['household-members', household?.id] })
      qc.invalidateQueries({ queryKey: ['household-analytics', household?.id] })
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: ['household-members', household?.id] })
    },
  })

  const removeMutation = useMutation({
    mutationFn: (userId: string) => removeMember(household!.id, userId),
    onMutate: (userId: string) => {
      qc.setQueryData(
        ['household-members', household?.id],
        (old: typeof members) => old?.filter(m => m.user_id !== userId) ?? old,
      )
    },
    onSuccess: () => {
      setConfirmRemoveId(null)
      qc.invalidateQueries({ queryKey: ['household-members', household?.id] })
      qc.invalidateQueries({ queryKey: ['household-analytics', household?.id] })
    },
    onError: () => {
      qc.invalidateQueries({ queryKey: ['household-members', household?.id] })
    },
  })

  const handleCopy = () => {
    if (!inviteCode) return
    navigator.clipboard.writeText(inviteCode)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const prevMonth = () => { if (month === 1) { setMonth(12); setYear(y => y - 1) } else setMonth(m => m - 1) }
  const nextMonth = () => { if (month === 12) { setMonth(1); setYear(y => y + 1) } else setMonth(m => m + 1) }

  const activeMembers  = members.filter(m => m.status === 'active')
  const pendingMembers = members.filter(m => m.status === 'pending')

  const isAdmin = !!currentUserId && activeMembers.some(
    m => m.user_id === currentUserId && m.role === 'admin',
  )

  const sectionTitle = 'text-xs font-semibold uppercase tracking-widest text-slate-500'
  const fmt = (n: number | string) => privacy ? '••••' : fmtNum(typeof n === 'string' ? Number(n) : n)

  const now = new Date()
  const isMaxMonth = year === now.getFullYear() && month === now.getMonth() + 1

  return (
    <div className="min-h-screen font-sans p-4 lg:p-8 bg-slate-950 text-white selection:bg-indigo-500/30">

      {/* ── Nav tabs ─────────────────────────────────────────────────────── */}
      <nav className="flex gap-1.5 mb-4 overflow-x-auto [scrollbar-width:none] pb-0.5">
        <button onClick={() => navigate('/')}
          className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border border-transparent transition-colors text-slate-400 hover:text-slate-200 hover:bg-slate-800">
          <Activity className="w-4 h-4" /><span className="hidden sm:inline">Análisis Global</span>
        </button>
        <button onClick={() => navigate('/stats')}
          className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border border-transparent transition-colors text-slate-400 hover:text-slate-200 hover:bg-slate-800">
          <BarChart2 className="w-4 h-4" /><span className="hidden sm:inline">Análisis Mensual</span>
        </button>
        <button className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">
          <Home className="w-4 h-4" /><span className="hidden sm:inline">Hogar</span>
        </button>
        <button onClick={() => navigate('/importacion')}
          className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border border-transparent transition-colors text-slate-400 hover:text-slate-200 hover:bg-slate-800">
          <Upload className="w-4 h-4" /><span className="hidden sm:inline">Importar</span>
        </button>
      </nav>

      {/* ── Header card ──────────────────────────────────────────────────── */}
      <header className="relative z-20 flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3 p-4 rounded-2xl border backdrop-blur-md bg-slate-900/50 border-slate-800/50">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-gradient-to-br from-indigo-400 to-violet-500 rounded-xl flex items-center justify-center shrink-0">
            <Home className="text-white w-4 h-4" />
          </div>
          <h1 className="text-sm font-bold text-white tracking-tight">
            Finanzas del Hogar · {MONTH_NAMES[month - 1]} {year}
          </h1>
        </div>
        <div className="flex items-center gap-2 w-full sm:w-auto flex-wrap">
          {/* Month + Year selector */}
          <div className="flex items-center gap-1 bg-slate-950 border border-slate-800 rounded-xl px-2 py-1.5">
            <button onClick={() => { setOpenDropdown(null); prevMonth() }} className="p-1 text-slate-400 hover:text-slate-200 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>

            {/* Mes */}
            <div className="relative">
              <button
                onClick={() => setOpenDropdown(openDropdown === 'mes' ? null : 'mes')}
                onBlur={closeDropdown}
                className="flex items-center gap-0.5 text-sm font-semibold text-slate-200 px-1 py-0.5 rounded-lg hover:bg-slate-800 transition-colors"
              >
                {MONTH_NAMES[month - 1]}
                <ChevronDown className="w-3 h-3 opacity-50" />
              </button>
              {openDropdown === 'mes' && (
                <div className="absolute top-full left-0 mt-1 z-[200] bg-slate-900 border border-slate-700 rounded-xl shadow-xl min-w-[130px] py-1 overflow-hidden max-h-60 overflow-y-auto">
                  {MONTH_NAMES.map((name, i) => (
                    <button
                      key={i + 1}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { setMonth(i + 1); setOpenDropdown(null) }}
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
                onClick={() => setOpenDropdown(openDropdown === 'año' ? null : 'año')}
                onBlur={closeDropdown}
                className="flex items-center gap-0.5 text-sm font-semibold text-slate-200 px-1 py-0.5 rounded-lg hover:bg-slate-800 transition-colors"
              >
                {year}
                <ChevronDown className="w-3 h-3 opacity-50" />
              </button>
              {openDropdown === 'año' && (
                <div className="absolute top-full left-0 mt-1 z-[200] bg-slate-900 border border-slate-700 rounded-xl shadow-xl py-1 overflow-hidden">
                  {Array.from({ length: 6 }, (_, i) => new Date().getFullYear() - 3 + i).map(y => (
                    <button
                      key={y}
                      onMouseDown={e => e.preventDefault()}
                      onClick={() => { setYear(y); setOpenDropdown(null) }}
                      className={`w-full text-left px-4 py-1.5 text-xs transition-colors hover:bg-slate-700 flex items-center justify-between gap-4 ${year === y ? 'font-semibold text-slate-200' : 'text-slate-400'}`}
                    >
                      {y}
                      {year === y && <span className="text-emerald-400 text-[10px]">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button onClick={() => { setOpenDropdown(null); nextMonth() }} disabled={isMaxMonth} className="p-1 text-slate-400 hover:text-slate-200 transition-colors disabled:opacity-30">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Privacy toggle */}
          <button
            onClick={() => { const next = !privacy; setPrivacy(next); localStorage.setItem('privacy', String(next)) }}
            className="p-2 text-slate-400 hover:text-indigo-400 bg-slate-950 border border-slate-800 rounded-lg transition-colors"
          >
            {privacy ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
          </button>

          {/* Moneda */}
          <div className="relative">
            <button
              onClick={() => setOpenDropdown(openDropdown === 'moneda' ? null : 'moneda')}
              onBlur={closeDropdown}
              className="flex items-center gap-2 bg-slate-950 border border-slate-800 rounded-lg px-3 py-2"
            >
              <DollarSign className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-medium text-slate-300">{currency}</span>
              <ChevronDown className="w-3 h-3 text-slate-500" />
            </button>
            {openDropdown === 'moneda' && (
              <div className="absolute top-full right-0 mt-1 z-[200] bg-slate-900 border border-slate-700 rounded-xl shadow-xl py-1 overflow-hidden min-w-[100px]">
                {[...new Set([homeCurrency, 'USD', 'EUR'])].map(c => (
                  <button
                    key={c}
                    onMouseDown={e => e.preventDefault()}
                    onClick={() => { setCurrency(c); setOpenDropdown(null) }}
                    className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-slate-700 flex items-center justify-between gap-3 ${currency === c ? 'font-semibold text-slate-200' : 'text-slate-400'}`}
                  >
                    {c}
                    {currency === c && <span className="text-emerald-400 text-[10px]">✓</span>}
                  </button>
                ))}
              </div>
            )}
          </div>
          {/* Export */}
          {analytics && household && (
            <ExportButton
              onExport={() => exportHouseholdPDF({
                analytics,
                members,
                householdName: household.name,
                month,
                year,
              })}
            />
          )}
          {/* Settings */}
          <button
            onClick={() => setSettingsOpen(true)}
            className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-indigo-400 transition-colors"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>
      </header>

      {/* ── Action buttons ────────────────────────────────────────────────── */}
      {households.length > 0 && (
        <div className="flex gap-2 mb-4 justify-end">
          <button onClick={() => setShowJoin(true)}
            className="px-4 py-2 rounded-xl text-sm font-semibold border transition-all bg-slate-800 border-slate-700 text-slate-300 hover:bg-slate-700">
            Unirse
          </button>
          <button onClick={() => setShowCreate(true)}
            className="flex items-center justify-center gap-1.5 px-4 py-2 bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 rounded-xl text-sm font-semibold hover:bg-indigo-500/30 transition-all">
            <Plus className="w-4 h-4" /> Crear
          </button>
        </div>
      )}

      <div className="space-y-3 sm:space-y-5">

        {/* ── Tabs múltiples hogares ────────────────────────────────────── */}
        {households.length > 1 && (
          <div className="flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none]">
            {households.map(h => (
              <button key={h.id} onClick={() => setSelectedId(h.id)}
                className={`shrink-0 px-4 py-2 rounded-xl text-sm font-medium border transition-all ${
                  (selectedId ?? households[0]?.id) === h.id
                    ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400'
                    : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                }`}>
                {h.name}
              </button>
            ))}
          </div>
        )}

        {/* ── Empty state ───────────────────────────────────────────────── */}
        {!isLoading && households.length === 0 && (
          <div className="text-center py-10 sm:py-16 rounded-3xl border bg-slate-900 border-slate-800 px-4">
            <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center bg-slate-800">
              <Users className="w-7 h-7 sm:w-8 sm:h-8 text-slate-500" />
            </div>
            <p className="font-semibold text-base text-slate-300">Ningún hogar todavía</p>
            <p className="text-sm mt-1 mb-6 text-slate-500">Creá uno nuevo o unite con un código</p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <button onClick={() => setShowCreate(true)}
                className="w-full sm:w-auto px-5 py-2.5 bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 rounded-xl text-sm font-semibold hover:bg-indigo-500/30 transition-all">
                Crear hogar
              </button>
              <button onClick={() => setShowJoin(true)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-xl text-sm font-semibold border transition-all bg-slate-800 border-slate-700 text-slate-300">
                Unirse con código
              </button>
            </div>
          </div>
        )}

        {isLoading && (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 animate-spin text-slate-500" />
          </div>
        )}

        {household && (
          <>
            {/* ══════════════════════════════════════════════════════════ */}
            {/* HOUSEHOLD HERO CARD                                        */}
            {/* ══════════════════════════════════════════════════════════ */}
            <div className={`rounded-3xl border overflow-hidden bg-slate-900 border-slate-800`}>

              {/* Gradient header strip */}
              <div className={`relative px-5 py-4 border-b bg-gradient-to-r from-indigo-500/10 to-purple-500/8 border-slate-800`}>
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className={`text-lg font-bold tracking-tight text-white`}>
                      {household.name}
                    </h2>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border bg-slate-800/80 border-slate-700 text-slate-300`}>
                        {household.base_currency}
                      </span>
                      <span className={`text-[11px] px-2 py-0.5 rounded-full font-semibold border bg-indigo-500/10 border-indigo-500/25 text-indigo-400`}>
                        {household.split_type === 'equal' ? 'Partes iguales' : 'Proporcional'}
                      </span>
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => inviteMutation.mutate()}
                        disabled={inviteMutation.isPending}
                        className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/15 border border-indigo-500/30 text-indigo-400 rounded-xl text-xs font-semibold hover:bg-indigo-500/25 transition-all">
                        {inviteMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                        Invitar
                      </button>
                      <button onClick={() => setShowEdit(true)}
                        className={`p-1.5 rounded-xl transition-colors text-slate-400 hover:text-white hover:bg-slate-800`}>
                        <Settings className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>

                {/* Stats row */}
                <div className="flex items-center gap-4 mt-3">
                  <div className="flex items-center gap-1.5">
                    <Users className="w-3.5 h-3.5 text-slate-400" />
                    <span className={`text-xs text-slate-400`}>
                      {activeMembers.length} {activeMembers.length === 1 ? 'miembro' : 'miembros'}
                    </span>
                  </div>
                  {analytics && Number(analytics.total_shared) > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Wallet className="w-3.5 h-3.5 text-slate-400" />
                      <span className={`text-xs text-slate-400`}>
                        {fmt(Number(analytics.total_shared))} {analytics.base_currency} compartido
                      </span>
                    </div>
                  )}
                  {analytics && analytics.settlement.length === 0 && analytics.members.length > 0 && (
                    <span className="text-xs font-semibold text-emerald-500">● Saldado</span>
                  )}
                  {analytics && analytics.settlement.length > 0 && (
                    <span className="text-xs font-semibold text-rose-400">● Deuda pendiente</span>
                  )}
                </div>
              </div>

              {/* Invite code strip */}
              {showInvite && inviteCode && (
                <div className={`flex items-center gap-3 px-5 py-3 border-b bg-indigo-500/8 border-indigo-500/20`}>
                  <span className="font-mono text-sm text-indigo-400 tracking-widest flex-1">{inviteCode}</span>
                  <button onClick={handleCopy}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/20 border border-indigo-500/30 text-indigo-400 rounded-lg text-xs font-semibold hover:bg-indigo-500/30 transition-all">
                    {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                    {copied ? 'Copiado' : 'Copiar'}
                  </button>
                  <button onClick={() => setShowInvite(false)} className="text-slate-500 hover:text-slate-300 transition-colors">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}

              {/* Solicitudes pendientes */}
              {isAdmin && pendingMembers.length > 0 && (
                <div className={`px-5 py-3 border-b bg-amber-500/6 border-amber-500/15`}>
                  <p className="text-xs font-semibold text-amber-500 uppercase tracking-wider mb-2">
                    {pendingMembers.length} solicitud{pendingMembers.length > 1 ? 'es' : ''} pendiente{pendingMembers.length > 1 ? 's' : ''}
                  </p>
                  <div className="space-y-2">
                    {pendingMembers.map(m => (
                      <div key={m.id} className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold ${avatarPalette(m.user_name).bg} ${avatarPalette(m.user_name).text}`}>
                            {m.user_name.charAt(0).toUpperCase()}
                          </div>
                          <span className={`text-sm text-slate-300`}>{m.user_name}</span>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => approveMutation.mutate(m.user_id)} disabled={approveMutation.isPending}
                            className="flex items-center gap-1 px-2.5 py-1.5 bg-emerald-500/15 border border-emerald-500/25 text-emerald-400 rounded-lg text-xs font-semibold hover:bg-emerald-500/25 transition-all">
                            <UserCheck className="w-3.5 h-3.5" /> Aprobar
                          </button>
                          <button onClick={() => removeMutation.mutate(m.user_id)} disabled={removeMutation.isPending}
                            className="p-1.5 bg-rose-500/15 border border-rose-500/25 text-rose-400 rounded-lg hover:bg-rose-500/25 transition-all">
                            <UserX className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Lista de miembros */}
              <div className="px-5 py-4 space-y-2">
                <p className={sectionTitle + ' mb-3'}>Miembros</p>
                {activeMembers.map(m => {
                  const pal          = m.role === 'admin' ? { bg: 'bg-amber-500/20', text: 'text-amber-400' } : avatarPalette(m.user_name)
                  const isConfirming = confirmRemoveId === m.user_id
                  return (
                    <div key={m.id}
                      className={`flex items-center justify-between px-3 py-2.5 rounded-2xl border transition-colors bg-slate-800/40 border-slate-700/40 hover:bg-slate-800/70`}>
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold ${pal.bg} ${pal.text}`}>
                          {m.user_name.charAt(0).toUpperCase()}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className={`text-sm font-semibold text-slate-200`}>{m.user_name}</p>
                            {m.role === 'admin' && <Crown className="w-3 h-3 text-amber-400" />}
                          </div>
                          <p className="text-[10px] text-slate-500">{m.role === 'admin' ? 'Administrador' : 'Miembro'}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        {isAdmin && m.role !== 'admin' && (
                          isConfirming ? (
                            <div className="flex items-center gap-1">
                              <span className="text-xs text-rose-400 mr-1">¿Eliminar?</span>
                              <button
                                onClick={() => removeMutation.mutate(m.user_id)}
                                disabled={removeMutation.isPending}
                                className="p-1.5 bg-rose-500/20 border border-rose-500/30 text-rose-400 rounded-lg hover:bg-rose-500/30 transition-all">
                                {removeMutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
                              </button>
                              <button
                                onClick={() => setConfirmRemoveId(null)}
                                className={`p-1.5 rounded-lg transition-colors text-slate-400 hover:bg-slate-700`}>
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmRemoveId(m.user_id)}
                              className={`p-1.5 rounded-xl transition-colors text-slate-600 hover:text-rose-400 hover:bg-rose-500/10`}>
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* ── Analytics ─────────────────────────────────────────────── */}
            {analyticsLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
              </div>
            ) : analyticsError ? (
              <div className={`flex items-center gap-3 p-4 rounded-2xl border bg-slate-900 border-slate-800 text-slate-400`}>
                <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0" />
                <p className="text-sm">No tenés acceso a los datos de este hogar.</p>
              </div>
            ) : analytics ? (
              <>
                {/* Alertas */}
                {analytics.alerts.map((alert, i) => (
                  <div key={i} className="flex items-start gap-2.5 p-3 bg-amber-500/8 border border-amber-500/20 rounded-xl">
                    <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-300">{alert.message}</p>
                  </div>
                ))}

                {/* Sin actividad */}
                {analytics.members.length === 0 && analytics.shared_expenses.length === 0 ? (
                  <div className={`text-center py-10 rounded-2xl border bg-slate-900 border-slate-800`}>
                    <TrendingDown className={`w-8 h-8 mx-auto mb-3 text-slate-600`} />
                    <p className={`text-sm font-medium text-slate-400`}>
                      Sin actividad compartida en {MONTH_NAMES[month - 1]}
                    </p>
                    <p className={`text-xs mt-1 text-slate-600`}>
                      Marcá gastos como "del hogar" al registrarlos
                    </p>
                  </div>
                ) : (
                  <>
                    {/* ══════════════════════════════════════════════════ */}
                    {/* 1. DONUT GRUPAL                                    */}
                    {/* ══════════════════════════════════════════════════ */}
                    {analytics.expense_by_category.length > 0 && (
                      <div id="fluxo-export-household-donut" className={`rounded-3xl border overflow-hidden bg-slate-900 border-slate-800`}>
                        <div className={`px-5 py-4 border-b border-slate-800`}>
                          <div className="flex items-center justify-between">
                            <p className={sectionTitle}>Gastos del grupo</p>
                            <span className={`text-xs font-bold tabular-nums text-slate-300`}>
                              {fmt(Number(analytics.total_shared))}
                              <span className={`font-normal ml-1 text-slate-500`}>{analytics.base_currency}</span>
                            </span>
                          </div>
                        </div>
                        <div className="p-5 flex items-start gap-5">
                          <div className="shrink-0">
                            <CategoryDonut
                              categories={analytics.expense_by_category.map(c => ({ name: c.category_name, total: Number(c.total) }))}
                              total={Number(analytics.total_shared)}
                              currency={analytics.base_currency}
                            />
                          </div>
                          <div className="flex-1 space-y-3 pt-1 min-w-0">
                            {analytics.expense_by_category.map((cat, i) => {
                              const pct = Number(analytics.total_shared) > 0
                                ? Number(cat.total) / Number(analytics.total_shared) : 0
                              const color = DONUT_COLORS[i % DONUT_COLORS.length]
                              return (
                                <div key={cat.category_name}>
                                  <div className="flex items-center gap-2 mb-1.5">
                                    <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                    <span className={`text-xs flex-1 truncate text-slate-300`}>{cat.category_name}</span>
                                    <span className="text-[10px] text-slate-500 tabular-nums shrink-0">{(pct * 100).toFixed(0)}%</span>
                                    <span className={`text-xs font-semibold tabular-nums shrink-0 text-slate-200`}>
                                      {fmt(Number(cat.total))}
                                    </span>
                                  </div>
                                  <div className={`h-1.5 rounded-full overflow-hidden bg-slate-800`}>
                                    <div
                                      className="h-full rounded-full transition-all duration-700"
                                      style={{ width: `${Math.max(pct * 100, 2)}%`, backgroundColor: color }}
                                    />
                                  </div>
                                </div>
                              )
                            })}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* ══════════════════════════════════════════════════ */}
                    {/* 2. ANÁLISIS POR MIEMBRO                           */}
                    {/* ══════════════════════════════════════════════════ */}
                    {analytics.members.length > 0 && (
                      <div className={`rounded-3xl border overflow-hidden bg-slate-900 border-slate-800`}>
                        <div className={`px-5 py-4 border-b border-slate-800`}>
                          <p className={sectionTitle}>Análisis por miembro</p>
                        </div>
                        <div className={`p-4 grid gap-4 ${analytics.members.length >= 2 ? 'grid-cols-2' : 'grid-cols-1'}`}>
                          {analytics.members.map(m => {
                            const breakdown = getMemberBreakdown(analytics.shared_expenses, m.user_id)
                            const balance   = Number(m.balance)
                            const isPos     = balance >= 0
                            const pal       = avatarPalette(m.user_name)
                            return (
                              <div key={m.user_id}
                                className={`rounded-2xl border p-4 flex flex-col gap-3 bg-slate-800/50 border-slate-700/40`}>
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-2.5 min-w-0">
                                    <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${pal.bg} ${pal.text}`}>
                                      {m.user_name.charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <p className={`text-sm font-semibold truncate text-slate-200`}>{m.user_name}</p>
                                      {household.split_type === 'proportional' && (
                                        <p className="text-[10px] text-slate-500">{Number(m.income_pct).toFixed(1)}% del ingreso</p>
                                      )}
                                    </div>
                                  </div>
                                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border tabular-nums shrink-0 ${
                                    isPos
                                      ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400'
                                      : 'bg-rose-500/10 border-rose-500/20 text-rose-400'
                                  }`}>
                                    {isPos ? '+' : ''}{fmt(balance)}
                                  </span>
                                </div>

                                {breakdown.categories.length > 0 ? (
                                  <div className="space-y-2">
                                    {breakdown.categories.map(cat => {
                                      const color = categoryColor(cat.name, analytics.expense_by_category)
                                      return (
                                        <div key={cat.name}>
                                          <div className="flex items-center gap-2 mb-1">
                                            <div className="w-2 h-2 rounded-full shrink-0" style={{ backgroundColor: color }} />
                                            <span className={`text-xs flex-1 truncate text-slate-400`}>{cat.name}</span>
                                            <span className="text-[10px] text-slate-500 tabular-nums shrink-0">{(cat.pct * 100).toFixed(0)}%</span>
                                            <span className={`text-xs font-bold tabular-nums shrink-0 text-slate-200`}>{fmt(cat.amount)}</span>
                                          </div>
                                          <div className={`h-1.5 rounded-full overflow-hidden bg-slate-700`}>
                                            <div className="h-full rounded-full transition-all duration-700"
                                              style={{ width: `${Math.max(cat.pct * 100, 2)}%`, backgroundColor: color }} />
                                          </div>
                                        </div>
                                      )
                                    })}
                                  </div>
                                ) : (
                                  <p className={`text-xs text-center py-2 text-slate-500`}>Sin gastos este período</p>
                                )}

                                <div className={`pt-3 border-t grid grid-cols-2 gap-2 border-slate-700/60`}>
                                  <div>
                                    <p className="text-[9px] uppercase tracking-widest text-slate-500 mb-0.5">Pagó</p>
                                    <p className={`text-sm font-bold tabular-nums text-slate-200`}>{fmt(Number(m.expenses_paid))}</p>
                                  </div>
                                  <div>
                                    <p className="text-[9px] uppercase tracking-widest text-slate-500 mb-0.5">Corresponde</p>
                                    <p className={`text-sm font-bold tabular-nums text-slate-200`}>{fmt(Number(m.should_pay))}</p>
                                  </div>
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    )}

                    {/* ══════════════════════════════════════════════════ */}
                    {/* 3. LIQUIDACIÓN                                    */}
                    {/* ══════════════════════════════════════════════════ */}
                    {analytics.settlement.length > 0 ? (
                      <div className={`rounded-3xl border overflow-hidden bg-slate-900 border-slate-800`}>
                        <div className={`px-5 py-4 border-b border-slate-800`}>
                          <p className={sectionTitle}>Liquidación</p>
                        </div>
                        <div className="p-4 space-y-2.5">
                          {analytics.settlement.map((s, i) => {
                            const palFrom = avatarPalette(s.from_user_name)
                            const palTo   = avatarPalette(s.to_user_name)
                            return (
                              <div key={i} className={`flex items-center gap-3 p-3.5 rounded-2xl border bg-rose-500/6 border-rose-500/15`}>
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${palFrom.bg} ${palFrom.text}`}>
                                  {s.from_user_name.charAt(0).toUpperCase()}
                                </div>
                                <div className="min-w-0">
                                  <p className={`text-xs font-semibold truncate text-slate-200`}>{s.from_user_name}</p>
                                  <p className="text-[10px] text-slate-500">deudor</p>
                                </div>
                                <div className="flex flex-col items-center gap-0.5 flex-1">
                                  <span className={`text-sm font-bold tabular-nums text-slate-200`}>
                                    {fmt(Number(s.amount))} {s.currency}
                                  </span>
                                  <ArrowRight className="w-4 h-4 text-slate-400" />
                                </div>
                                <div className="min-w-0 text-right">
                                  <p className={`text-xs font-semibold truncate text-slate-200`}>{s.to_user_name}</p>
                                  <p className="text-[10px] text-slate-500">acreedor</p>
                                </div>
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-sm font-bold shrink-0 ${palTo.bg} ${palTo.text}`}>
                                  {s.to_user_name.charAt(0).toUpperCase()}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                      </div>
                    ) : analytics.members.length > 0 ? (
                      <div className={`rounded-2xl border py-5 text-center bg-emerald-500/6 border-emerald-500/15`}>
                        <p className="text-sm font-bold text-emerald-500">¡Sin deudas este período!</p>
                        <p className={`text-xs mt-0.5 text-emerald-600`}>Todos contribuyeron según lo acordado</p>
                      </div>
                    ) : null}

                    {/* ══════════════════════════════════════════════════ */}
                    {/* 4. HISTORIAL DE GASTOS                            */}
                    {/* ══════════════════════════════════════════════════ */}
                    {analytics.shared_expenses.length > 0 && (() => {
                      const q = filterSearch.toLowerCase().trim()
                      const displayed = analytics.shared_expenses.filter(e => {
                        if (filterMember   && e.paid_by_user_id  !== filterMember)   return false
                        if (filterCategory && e.category_name    !== filterCategory)  return false
                        if (filterAmount.trim() && !String(Math.round(Number(e.amount))).includes(filterAmount.trim())) return false
                        if (q && !(
                          e.concept_name?.toLowerCase().includes(q) ||
                          e.category_name?.toLowerCase().includes(q) ||
                          e.paid_by_user_name?.toLowerCase().includes(q)
                        )) return false
                        return true
                      })
                      return (
                        <div className={`rounded-3xl border overflow-hidden bg-slate-900 border-slate-800`}>
                          <div className={`px-5 pt-4 pb-3 border-b border-slate-800`}>
                            {/* Título */}
                            <div className="flex items-center justify-between mb-3">
                              <p className={sectionTitle}>
                                Historial de gastos
                                <span className="normal-case font-normal text-slate-500 ml-1">
                                  ({displayed.length}{(filterMember || filterCategory || filterSearch || filterAmount) ? ` de ${analytics.shared_expenses.length}` : ''})
                                </span>
                              </p>
                            </div>

                            {/* Dropdowns: Miembro + Categoría */}
                            <div className="flex items-center gap-2">

                              {/* Miembro */}
                              <div className="relative">
                                <button
                                  onClick={() => setOpenDropdown(openDropdown === 'miembro' ? null : 'miembro')}
                                  onBlur={closeDropdown}
                                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${
                                    filterMember
                                      ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400'
                                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                                  }`}
                                >
                                  Miembro
                                  {filterMember && (
                                    <span className="opacity-75">· {activeMembers.find(m => m.user_id === filterMember)?.user_name}</span>
                                  )}
                                  <ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />
                                </button>
                                {openDropdown === 'miembro' && (
                                  <div className="absolute top-full left-0 mt-1 z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-xl min-w-[160px] py-1 overflow-hidden max-h-52 overflow-y-auto">
                                    <button
                                      onMouseDown={e => e.preventDefault()}
                                      onClick={() => { setFilterMember(null); setOpenDropdown(null) }}
                                      className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-slate-700 flex items-center justify-between ${
                                        !filterMember ? 'font-semibold text-slate-200' : 'text-slate-400'
                                      }`}
                                    >
                                      Todos
                                      {!filterMember && <span className="text-emerald-400 text-[10px]">✓</span>}
                                    </button>
                                    {activeMembers.map(m => (
                                      <button
                                        key={m.user_id}
                                        onMouseDown={e => e.preventDefault()}
                                        onClick={() => { setFilterMember(m.user_id); setOpenDropdown(null) }}
                                        className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-slate-700 flex items-center justify-between gap-2 ${
                                          filterMember === m.user_id ? 'font-semibold text-indigo-300' : 'text-slate-400'
                                        }`}
                                      >
                                        <span className="flex items-center gap-2">
                                          <div className={`w-2 h-2 rounded-full shrink-0 ${avatarPalette(m.user_name).bg.replace('/20', '')}`} />
                                          {m.user_name}
                                        </span>
                                        {filterMember === m.user_id && <span className="text-emerald-400 text-[10px]">✓</span>}
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
                                    filterCategory
                                      ? 'bg-indigo-500/20 border-indigo-500/30 text-indigo-400'
                                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700'
                                  }`}
                                >
                                  Categoría
                                  {filterCategory && <span className="opacity-75">· {filterCategory}</span>}
                                  <ChevronDown className="w-3 h-3 ml-0.5 opacity-60" />
                                </button>
                                {openDropdown === 'categoria' && (
                                  <div className="absolute top-full left-0 mt-1 z-50 bg-slate-800 border border-slate-700 rounded-xl shadow-xl min-w-[180px] py-1 overflow-hidden max-h-52 overflow-y-auto">
                                    <button
                                      onMouseDown={e => e.preventDefault()}
                                      onClick={() => { setFilterCategory(null); setOpenDropdown(null) }}
                                      className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-slate-700 flex items-center justify-between ${
                                        !filterCategory ? 'font-semibold text-slate-200' : 'text-slate-400'
                                      }`}
                                    >
                                      Todas
                                      {!filterCategory && <span className="text-emerald-400 text-[10px]">✓</span>}
                                    </button>
                                    {analytics.expense_by_category.map((cat, i) => (
                                      <button
                                        key={cat.category_name}
                                        onMouseDown={e => e.preventDefault()}
                                        onClick={() => { setFilterCategory(cat.category_name); setOpenDropdown(null) }}
                                        className={`w-full text-left px-3 py-2 text-xs transition-colors hover:bg-slate-700 flex items-center justify-between gap-2 ${
                                          filterCategory === cat.category_name ? 'font-semibold text-indigo-300' : 'text-slate-400'
                                        }`}
                                      >
                                        <span className="flex items-center gap-2">
                                          <div className="w-2 h-2 rounded-full shrink-0"
                                            style={{ backgroundColor: DONUT_COLORS[i % DONUT_COLORS.length] }} />
                                          {cat.category_name}
                                        </span>
                                        {filterCategory === cat.category_name && <span className="text-emerald-400 text-[10px]">✓</span>}
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>

                              {/* Monto */}
                              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold border bg-slate-800 border-slate-700">
                                <span className="text-slate-500 shrink-0">Monto:</span>
                                <input
                                  type="number"
                                  value={filterAmount}
                                  onChange={e => setFilterAmount(e.target.value)}
                                  placeholder="—"
                                  className="w-16 bg-transparent text-slate-300 outline-none placeholder:text-slate-600 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
                                />
                                {filterAmount && (
                                  <button onClick={() => setFilterAmount('')} className="text-slate-600 hover:text-slate-400">
                                    <X className="w-3 h-3" />
                                  </button>
                                )}
                              </div>

                              {/* Limpiar */}
                              {(filterMember || filterCategory || filterSearch || filterAmount) && (
                                <button
                                  onClick={() => { setFilterMember(null); setFilterCategory(null); setFilterSearch(''); setFilterAmount('') }}
                                  className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-all bg-rose-500/10 border-rose-500/20 text-rose-400 hover:bg-rose-500/20"
                                >
                                  <X className="w-3 h-3" />
                                  Limpiar
                                </button>
                              )}
                            </div>

                            {/* Buscador */}
                            <div className="relative mt-2.5">
                              <input
                                type="text"
                                value={filterSearch}
                                onChange={e => setFilterSearch(e.target.value)}
                                placeholder="Buscar por concepto, categoría o miembro..."
                                className="w-full bg-slate-800 border border-slate-700 rounded-xl pl-8 pr-4 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500/60 transition-colors placeholder:text-slate-600"
                              />
                              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-600 pointer-events-none" />
                              {filterSearch && (
                                <button onClick={() => setFilterSearch('')} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-600 hover:text-slate-400">
                                  <X className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="overflow-x-auto overflow-y-auto" style={{ maxHeight: 340 }}>
                            {displayed.length === 0 ? (
                              <p className="text-sm text-center py-4 text-slate-500">
                                Sin resultados para los filtros seleccionados
                              </p>
                            ) : (
                              <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-slate-900 z-10">
                                  <tr className="text-slate-600 uppercase text-[11px]">
                                    <th className="text-left pb-2 pt-1 pl-4">Fecha</th>
                                    <th className="text-left pb-2 pt-1">Categoría · Concepto</th>
                                    <th className="text-left pb-2 pt-1 hidden lg:table-cell">Descripción</th>
                                    <th className="text-left pb-2 pt-1 hidden sm:table-cell">Miembro</th>
                                    <th className="text-left pb-2 pt-1 hidden md:table-cell">Cuenta</th>
                                    <th className="text-right pb-2 pt-1 pr-4">Monto</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-800/50">
                                  {displayed.map(e => {
                                    const pal = avatarPalette(e.paid_by_user_name)
                                    return (
                                      <tr key={e.transaction_id} className="hover:bg-slate-800/30 transition-colors">
                                        <td className="py-2 pl-4 text-slate-500 whitespace-nowrap">{e.date}</td>
                                        <td className="py-2">
                                          <p className="text-slate-300 font-medium leading-tight">{e.category_name}</p>
                                          <p className="text-slate-600 leading-tight">{e.concept_name}</p>
                                        </td>
                                        <td className="py-2 text-slate-500 hidden lg:table-cell max-w-[180px] truncate">{e.description}</td>
                                        <td className="py-2 hidden sm:table-cell">
                                          <div className="flex items-center gap-1.5">
                                            <div className={`w-5 h-5 rounded-md flex items-center justify-center text-[10px] font-bold shrink-0 ${pal.bg} ${pal.text}`}>
                                              {e.paid_by_user_name.charAt(0).toUpperCase()}
                                            </div>
                                            <span className="text-slate-500 truncate">{e.paid_by_user_name}</span>
                                          </div>
                                        </td>
                                        <td className="py-2 text-slate-500 hidden md:table-cell">{e.account_name}</td>
                                        <td className="py-2 pr-4 text-right font-semibold tabular-nums text-rose-400">
                                          -{fmt(Number(e.amount))}
                                        </td>
                                      </tr>
                                    )
                                  })}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>
                      )
                    })()}
                  </>
                )}
              </>
            ) : null}
          </>
        )}

        <div className="h-4" />
      </div>

      {showCreate && <CreateModal onClose={() => setShowCreate(false)} />}
      {showJoin   && <JoinModal   onClose={() => setShowJoin(false)}   />}
      {showEdit   && household && <EditModal household={household} onClose={() => setShowEdit(false)} />}
      <SettingsDrawer open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </div>
  )
}
