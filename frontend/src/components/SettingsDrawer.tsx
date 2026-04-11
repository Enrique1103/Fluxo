import { useState, useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  X, LogOut, KeyRound, Globe, Loader2, CheckCircle, AlertCircle,
  User, Trash2, Edit3, Camera, CreditCard, Tag, TrendingUp,
  ChevronRight, ArrowLeft, Plus, Target, Eye, EyeOff, Sun, Moon,
} from 'lucide-react'
import useTheme from '../hooks/useTheme'
import {
  fetchMe, updateCurrency, updateName, updatePassword, logoutApi, deleteUserAccount,
  fetchAccounts, updateAccount, deleteAccount, type Account,
  fetchCategories, fetchConcepts, checkExchangeRates,
  fetchFinGoals, deleteFinGoal, type FinGoal,
} from '../api/dashboard'
import { useAuthStore } from '../store/authStore'
import { invalidateFinancialData } from '../lib/queryClient'
import ConfirmDialog from './ConfirmDialog'
import EtiquetasContent from './EtiquetasDrawer'
import ExchangeRateManager from './ExchangeRateManager'
import AccountModal from './AccountModal'
import GoalModal from './GoalModal'

export type Section = null | 'perfil' | 'cuentas' | 'etiquetas' | 'tasas' | 'metas' | 'eliminar-cuenta'

type Status = { type: 'success' | 'error'; msg: string } | null

interface Props {
  open: boolean
  onClose: () => void
  initialSection?: Section
}

function parseErr(err: any, fallback: string) {
  if (!err?.response) return 'Sin conexión con el servidor'
  const detail = err.response?.data?.detail
  if (!detail) return fallback
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((e: any) => e.msg ?? e).join('. ')
  return fallback
}

function StatusMsg({ status }: { status: Status }) {
  if (!status) return null
  return (
    <div className={`flex items-center gap-1.5 mt-2 text-xs ${status.type === 'success' ? 'text-emerald-400' : 'text-red-400'}`}>
      {status.type === 'success'
        ? <CheckCircle className="w-3.5 h-3.5 shrink-0" />
        : <AlertCircle className="w-3.5 h-3.5 shrink-0" />}
      {status.msg}
    </div>
  )
}

// ─── Main menu ────────────────────────────────────────────────────────────────

function MainMenu({ open, onNavigate }: {
  open: boolean
  onNavigate: (s: NonNullable<Section>) => void
}) {
  const { theme, toggleTheme } = useTheme()
  const { data: me }            = useQuery({ queryKey: ['me'],                   queryFn: fetchMe,             enabled: open })
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'],             queryFn: fetchAccounts,       enabled: open })
  const { data: categories = [] } = useQuery({ queryKey: ['categories'],         queryFn: fetchCategories,     enabled: open })
  const { data: concepts = [] } = useQuery({ queryKey: ['concepts'],             queryFn: fetchConcepts,       enabled: open })
  const { data: rateCheck }     = useQuery({ queryKey: ['exchange-rates-check'], queryFn: checkExchangeRates, enabled: open })
  const { data: finGoals = [] } = useQuery({ queryKey: ['fin-goals'],            queryFn: fetchFinGoals,       enabled: open })

  const photoKey = me?.id ? `avatar_${me.id}` : null
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!photoKey) return
    setPhotoUrl(localStorage.getItem(photoKey))
  }, [photoKey])

  const initials = me?.name
    ? me.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  const hasRateWarning = rateCheck != null && !rateCheck.has_all_rates

  const items = [
    {
      key:      'perfil'    as const,
      Icon:     User,
      label:    'Perfil',
      subtitle: 'Nombre, moneda, contraseña',
      warning:  false,
    },
    {
      key:      'cuentas'   as const,
      Icon:     CreditCard,
      label:    'Cuentas',
      subtitle: accounts.length === 0 ? 'Sin cuentas' : `${accounts.length} cuenta${accounts.length !== 1 ? 's' : ''}`,
      warning:  false,
    },
    {
      key:      'etiquetas' as const,
      Icon:     Tag,
      label:    'Etiquetas',
      subtitle: `${categories.length} categorías · ${concepts.length} conceptos`,
      warning:  false,
    },
    {
      key:      'tasas'     as const,
      Icon:     TrendingUp,
      label:    'Tasas de cambio',
      subtitle: hasRateWarning ? 'Faltan tasas para este mes' : 'Tipo de cambio mensual',
      warning:  hasRateWarning,
    },
    {
      key:      'metas'     as const,
      Icon:     Target,
      label:    'Metas financieras',
      subtitle: finGoals.length === 0 ? 'Sin metas' : `${finGoals.length} meta${finGoals.length !== 1 ? 's' : ''} activa${finGoals.length !== 1 ? 's' : ''}`,
      warning:  false,
    },
  ]

  return (
    <div className="px-6 py-6 space-y-6">
      {/* User card */}
      <div className="flex items-center gap-4 bg-slate-800/40 border border-slate-700/40 rounded-2xl p-4">
        <div className="w-12 h-12 rounded-xl overflow-hidden bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center shrink-0">
          {photoUrl
            ? <img src={photoUrl} alt="avatar" className="w-full h-full object-cover" />
            : <span className="text-slate-950 font-bold text-sm">{initials}</span>
          }
        </div>
        <div className="min-w-0">
          <p className="text-white font-semibold truncate">{me?.name ?? '…'}</p>
          <p className="text-slate-400 text-sm truncate">{me?.email ?? '…'}</p>
        </div>
      </div>

      {/* Nav items */}
      <nav className="space-y-1">
        {items.map(({ key, Icon, label, subtitle, warning }) => (
          <button
            key={key}
            onClick={() => onNavigate(key)}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-xl hover:bg-slate-800/80 transition-colors group text-left"
          >
            <div className="w-9 h-9 rounded-xl bg-slate-800 group-hover:bg-slate-700/80 flex items-center justify-center shrink-0 transition-colors">
              <Icon className="w-4 h-4 text-emerald-400" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200 flex items-center gap-2">
                {label}
                {warning && <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse inline-block" />}
              </p>
              <p className={`text-xs truncate mt-0.5 ${warning ? 'text-amber-400/70' : 'text-slate-500'}`}>
                {subtitle}
              </p>
            </div>
            <ChevronRight className="w-4 h-4 text-slate-600 group-hover:text-slate-400 shrink-0 transition-colors" />
          </button>
        ))}

        {/* Theme toggle */}
        <div className="flex items-center gap-3 px-4 py-3.5 rounded-xl">
          <div className="w-9 h-9 rounded-xl bg-slate-800 flex items-center justify-center shrink-0">
            {theme === 'dark'
              ? <Moon className="w-4 h-4 text-emerald-400" />
              : <Sun  className="w-4 h-4 text-emerald-400" />}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-slate-200">Tema</p>
            <p className="text-xs text-slate-500 mt-0.5">{theme === 'dark' ? 'Oscuro' : 'Claro'}</p>
          </div>
          <button
            onClick={toggleTheme}
            className={`relative w-11 h-6 rounded-full transition-colors ${theme === 'light' ? 'bg-emerald-500' : 'bg-slate-700'}`}
          >
            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${theme === 'light' ? 'translate-x-5' : 'translate-x-0'}`} />
          </button>
        </div>
      </nav>
    </div>
  )
}

// ─── Perfil section ───────────────────────────────────────────────────────────

function PerfilSection({ open }: { open: boolean }) {
  const queryClient = useQueryClient()
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: fetchMe, enabled: open })

  // Name
  const [editName,   setEditName]   = useState('')
  const [nameStatus, setNameStatus] = useState<Status>(null)
  const [savingName, setSavingName] = useState(false)
  useEffect(() => { if (me?.name) setEditName(me.name) }, [me?.name])
  const handleNameSave = async () => {
    if (!editName.trim() || editName.trim() === me?.name) return
    setSavingName(true); setNameStatus(null)
    try {
      await updateName(editName.trim())
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      setNameStatus({ type: 'success', msg: 'Nombre actualizado' })
    } catch (err: any) {
      setNameStatus({ type: 'error', msg: parseErr(err, 'No se pudo actualizar') })
    } finally { setSavingName(false) }
  }

  // Currency
  const [optimisticCurrency, setOptimisticCurrency] = useState<string | null>(null)
  const [currencyStatus,     setCurrencyStatus]     = useState<Status>(null)
  const [savingCurrency,     setSavingCurrency]     = useState(false)
  const activeCurrency = optimisticCurrency ?? me?.currency_default ?? ''
  const handleCurrencyChange = async (value: string) => {
    if (value === activeCurrency || savingCurrency) return
    setOptimisticCurrency(value); setSavingCurrency(true); setCurrencyStatus(null)
    try {
      await updateCurrency(value)
      await queryClient.invalidateQueries({ queryKey: ['me'] })
      await invalidateFinancialData(queryClient)
      setCurrencyStatus({ type: 'success', msg: 'Moneda actualizada' })
    } catch (err: any) {
      setOptimisticCurrency(null)
      setCurrencyStatus({ type: 'error', msg: parseErr(err, 'No se pudo actualizar') })
    } finally { setSavingCurrency(false) }
  }

  // Password
  const [currentPass, setCurrentPass] = useState('')
  const [newPass,     setNewPass]     = useState('')
  const [passStatus,  setPassStatus]  = useState<Status>(null)
  const [savingPass,  setSavingPass]  = useState(false)
  const handlePasswordSave = async () => {
    if (!currentPass || !newPass) return
    setSavingPass(true); setPassStatus(null)
    try {
      await updatePassword(currentPass, newPass)
      setCurrentPass(''); setNewPass('')
      setPassStatus({ type: 'success', msg: 'Contraseña actualizada' })
    } catch (err: any) {
      setPassStatus({ type: 'error', msg: err?.response?.data?.detail ?? 'Contraseña actual incorrecta' })
    } finally { setSavingPass(false) }
  }

  // Avatar
  const photoInputRef = useRef<HTMLInputElement>(null)
  const photoKey  = me?.id ? `avatar_${me.id}` : null
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  useEffect(() => {
    if (!photoKey) return
    setPhotoUrl(localStorage.getItem(photoKey) ?? null)
  }, [photoKey])
  const handlePhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file || !photoKey) return
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = reader.result as string
      localStorage.setItem(photoKey, dataUrl)
      setPhotoUrl(dataUrl)
    }
    reader.readAsDataURL(file)
  }
  const initials = me?.name
    ? me.name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2)
    : '?'

  return (
    <div className="px-6 py-6 space-y-8">

      {/* Avatar */}
      <div className="flex items-center gap-4">
        <div className="relative shrink-0">
          <div className="w-14 h-14 rounded-2xl overflow-hidden bg-gradient-to-br from-emerald-400 to-cyan-500 flex items-center justify-center">
            {photoUrl
              ? <img src={photoUrl} alt="avatar" className="w-full h-full object-cover" />
              : <span className="text-slate-950 font-bold text-base">{initials}</span>
            }
          </div>
          {photoKey && (
            <button
              onClick={() => photoInputRef.current?.click()}
              className="absolute -bottom-1 -right-1 w-6 h-6 bg-slate-700 hover:bg-slate-600 border border-slate-600 rounded-lg flex items-center justify-center transition-colors"
              title="Cambiar foto"
            >
              <Camera className="w-3 h-3 text-slate-300" />
            </button>
          )}
          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
        </div>
        <div className="min-w-0">
          <p className="text-white font-semibold truncate">{me?.name ?? '…'}</p>
          <p className="text-slate-400 text-sm truncate">{me?.email ?? '…'}</p>
        </div>
      </div>

      {/* Name */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <User className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-200">Nombre</h3>
        </div>
        <div className="flex gap-2">
          <input
            type="text"
            value={editName}
            onChange={e => setEditName(e.target.value)}
            className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-500/60 transition-colors"
          />
          <button
            onClick={handleNameSave}
            disabled={savingName || !editName.trim() || editName.trim() === me?.name}
            className="px-4 py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 rounded-xl text-sm font-bold transition-colors flex items-center gap-1"
          >
            {savingName ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Guardar'}
          </button>
        </div>
        <StatusMsg status={nameStatus} />
      </section>

      {/* Currency */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <Globe className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-200">Moneda por defecto</h3>
        </div>
        <div className="flex gap-2">
          {(['UYU', 'USD', 'EUR'] as const).map(cur => (
            <button
              key={cur}
              disabled={savingCurrency}
              onClick={() => handleCurrencyChange(cur)}
              translate="no"
              className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${
                activeCurrency === cur
                  ? 'bg-emerald-400/15 border-emerald-400/40 text-emerald-400'
                  : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
              }`}
            >
              {savingCurrency && activeCurrency === cur
                ? <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto" />
                : cur}
            </button>
          ))}
        </div>
        <StatusMsg status={currencyStatus} />
      </section>

      {/* Password */}
      <section>
        <div className="flex items-center gap-2 mb-3">
          <KeyRound className="w-4 h-4 text-emerald-400" />
          <h3 className="text-sm font-semibold text-slate-200">Cambiar contraseña</h3>
        </div>
        <div className="space-y-2">
          <input
            type="password"
            placeholder="Contraseña actual"
            value={currentPass}
            onChange={e => setCurrentPass(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-500/60 transition-colors"
          />
          <input
            type="password"
            placeholder="Nueva contraseña"
            value={newPass}
            onChange={e => setNewPass(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-emerald-500/60 transition-colors"
          />
          <p className="text-[10px] text-slate-600 px-1">
            Mín. 8 caracteres · mayúscula · minúscula · número · símbolo (@$!%*?&)
          </p>
          <button
            onClick={handlePasswordSave}
            disabled={savingPass || !currentPass || !newPass}
            className="w-full py-2.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 disabled:cursor-not-allowed text-slate-950 rounded-xl text-sm font-bold transition-colors flex items-center justify-center gap-2"
          >
            {savingPass && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar contraseña
          </button>
        </div>
        <StatusMsg status={passStatus} />
      </section>
    </div>
  )
}

// ─── Cuentas section ──────────────────────────────────────────────────────────

function CuentasSection({ open, onNewAcct }: { open: boolean; onNewAcct: () => void }) {
  const queryClient = useQueryClient()
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn:  fetchAccounts,
    enabled:  open,
  })

  const [editingAcct,     setEditingAcct]     = useState<string | null>(null)
  const [editAcctName,    setEditAcctName]    = useState('')
  const [editAcctLimit,   setEditAcctLimit]   = useState('')
  const [acctStatus,      setAcctStatus]      = useState<Status>(null)
  const [savingAcct,      setSavingAcct]      = useState(false)
  const [deletingAcct,    setDeletingAcct]    = useState<string | null>(null)
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const startEdit = (acct: Account) => {
    setEditingAcct(acct.id)
    setEditAcctName(acct.name)
    setEditAcctLimit(acct.credit_limit != null ? String(acct.credit_limit) : '')
    setAcctStatus(null)
  }

  const handleSave = async (acct: Account) => {
    if (!editAcctName.trim()) return
    setSavingAcct(true); setAcctStatus(null)
    try {
      const payload: { name?: string; credit_limit?: number } = { name: editAcctName.trim() }
      if (acct.type === 'credit' && editAcctLimit) payload.credit_limit = parseFloat(editAcctLimit)
      await updateAccount(acct.id, payload)
      await invalidateFinancialData(queryClient)
      setEditingAcct(null)
      setAcctStatus({ type: 'success', msg: 'Cuenta actualizada' })
    } catch (err: any) {
      setAcctStatus({ type: 'error', msg: parseErr(err, 'No se pudo actualizar la cuenta') })
    } finally { setSavingAcct(false) }
  }

  const confirmDelete = async () => {
    if (!confirmDeleteId) return
    const id = confirmDeleteId
    setConfirmDeleteId(null)
    setDeletingAcct(id)
    try {
      await deleteAccount(id)
      await invalidateFinancialData(queryClient)
    } catch (err: any) {
      setAcctStatus({ type: 'error', msg: parseErr(err, 'No se pudo eliminar la cuenta') })
    } finally { setDeletingAcct(null) }
  }

  return (
    <>
      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Eliminar cuenta"
        message="¿Eliminar esta cuenta? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />

      <div className="px-6 py-6 space-y-3">
        <button
          onClick={onNewAcct}
          className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-slate-700 hover:border-emerald-500/50 text-slate-500 hover:text-emerald-400 rounded-xl text-sm transition-all"
        >
          <Plus className="w-4 h-4" /> Nueva cuenta
        </button>

        {accounts.length === 0 && (
          <p className="text-slate-500 text-xs text-center py-4">Sin cuentas registradas</p>
        )}

        {accounts.map(acct => (
          <div key={acct.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
            {editingAcct === acct.id ? (
              <div className="space-y-2">
                <input
                  type="text"
                  value={editAcctName}
                  onChange={e => setEditAcctName(e.target.value)}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500/60"
                />
                {acct.type === 'credit' && (
                  <input
                    type="number"
                    value={editAcctLimit}
                    onChange={e => setEditAcctLimit(e.target.value)}
                    placeholder="Límite de crédito"
                    className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500/60"
                  />
                )}
                <div className="flex gap-2">
                  <button
                    onClick={() => handleSave(acct)}
                    disabled={savingAcct}
                    className="flex-1 py-1.5 bg-emerald-500 hover:bg-emerald-400 disabled:opacity-40 text-slate-950 rounded-lg text-xs font-bold transition-colors"
                  >
                    {savingAcct ? <Loader2 className="w-3 h-3 animate-spin mx-auto" /> : 'Guardar'}
                  </button>
                  <button
                    onClick={() => setEditingAcct(null)}
                    className="flex-1 py-1.5 bg-slate-700 hover:bg-slate-600 text-slate-300 rounded-lg text-xs font-medium transition-colors"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-200 truncate">{acct.name}</p>
                  <p className="text-[11px] text-slate-500">{acct.type} · {acct.currency} · {Number(acct.balance).toLocaleString()}</p>
                </div>
                <div className="flex gap-1 shrink-0 ml-2">
                  <button
                    onClick={() => startEdit(acct)}
                    className="p-1.5 text-slate-500 hover:text-slate-200 transition-colors rounded-lg hover:bg-slate-700"
                  >
                    <Edit3 className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => setConfirmDeleteId(acct.id)}
                    disabled={deletingAcct === acct.id}
                    className="p-1.5 text-slate-500 hover:text-red-400 transition-colors rounded-lg hover:bg-slate-700 disabled:opacity-40"
                  >
                    {deletingAcct === acct.id
                      ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      : <Trash2 className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        <StatusMsg status={acctStatus} />
      </div>
    </>
  )
}

// ─── Tasas section ────────────────────────────────────────────────────────────

function TasasSection({ open }: { open: boolean }) {
  const { data: me } = useQuery({ queryKey: ['me'], queryFn: fetchMe, enabled: open })
  return (
    <div className="px-6 py-6">
      <ExchangeRateManager userCurrency={me?.currency_default ?? 'UYU'} />
    </div>
  )
}

// ─── Metas section ────────────────────────────────────────────────────────────

function MetasSection({ open, onNewGoal, onEditGoal }: {
  open: boolean
  onNewGoal: () => void
  onEditGoal: (goal: FinGoal) => void
}) {
  const queryClient = useQueryClient()
  const { data: finGoals = [], isLoading } = useQuery({
    queryKey: ['fin-goals'],
    queryFn:  fetchFinGoals,
    enabled:  open,
  })

  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)
  const [deletingId,      setDeletingId]      = useState<string | null>(null)
  const [deleteStatus,    setDeleteStatus]    = useState<Status>(null)

  const confirmDelete = async () => {
    if (!confirmDeleteId) return
    const id = confirmDeleteId
    setConfirmDeleteId(null)
    setDeletingId(id)
    setDeleteStatus(null)
    try {
      await deleteFinGoal(id)
      await queryClient.invalidateQueries({ queryKey: ['fin-goals'] })
      await queryClient.invalidateQueries({ queryKey: ['summary'] })
    } catch {
      setDeleteStatus({ type: 'error', msg: 'No se pudo eliminar la meta' })
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <>
      <ConfirmDialog
        open={!!confirmDeleteId}
        title="Eliminar meta"
        message="¿Eliminar esta meta? Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        cancelLabel="Cancelar"
        danger
        onConfirm={confirmDelete}
        onCancel={() => setConfirmDeleteId(null)}
      />

      <div className="px-6 py-6 space-y-3">
        <button
          onClick={onNewGoal}
          disabled={finGoals.length >= 3}
          className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-slate-700 hover:border-emerald-500/50 text-slate-500 hover:text-emerald-400 rounded-xl text-sm transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:border-slate-700 disabled:hover:text-slate-500"
          title={finGoals.length >= 3 ? 'Límite de 3 metas alcanzado' : undefined}
        >
          <Plus className="w-4 h-4" />
          {finGoals.length >= 3 ? 'Límite de 3 metas alcanzado' : 'Nueva Meta'}
        </button>

        {isLoading && (
          <div className="space-y-3">
            {[1, 2].map(i => <div key={i} className="h-14 bg-slate-800/50 animate-pulse rounded-xl" />)}
          </div>
        )}

        {!isLoading && finGoals.length === 0 && (
          <p className="text-slate-500 text-xs text-center py-4">Sin metas registradas</p>
        )}

        {finGoals.map(goal => (
          <div key={goal.id} className="bg-slate-800/50 border border-slate-700 rounded-xl p-3">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <p className="text-sm font-medium text-slate-200 truncate">{goal.name}</p>
                <p className="text-[11px] text-slate-500">
                  Meta: {Number(goal.target_amount).toLocaleString()} · {goal.allocation_pct}% del flujo
                </p>
              </div>
              <div className="flex gap-1 shrink-0 ml-2">
                <button
                  onClick={() => onEditGoal(goal)}
                  className="p-1.5 text-slate-500 hover:text-slate-200 transition-colors rounded-lg hover:bg-slate-700"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setConfirmDeleteId(goal.id)}
                  disabled={deletingId === goal.id}
                  className="p-1.5 text-slate-500 hover:text-red-400 transition-colors rounded-lg hover:bg-slate-700 disabled:opacity-40"
                >
                  {deletingId === goal.id
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Trash2  className="w-3.5 h-3.5" />}
                </button>
              </div>
            </div>
          </div>
        ))}

        <StatusMsg status={deleteStatus} />
      </div>
    </>
  )
}

// ─── Logout footer ────────────────────────────────────────────────────────────

function MainFooter({ onDeleteAccount, onLogout }: {
  onDeleteAccount: () => void
  onLogout: () => void
}) {
  const [loggingOut, setLoggingOut] = useState(false)

  const handleLogout = async () => {
    setLoggingOut(true)
    await onLogout()
  }

  return (
    <div className="px-6 py-5 border-t border-slate-800 shrink-0 space-y-2">
      <button
        onClick={handleLogout}
        disabled={loggingOut}
        className="w-full py-3 rounded-xl text-sm font-bold border border-red-500/30 text-red-400 hover:bg-red-500/10 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
      >
        {loggingOut ? <Loader2 className="w-4 h-4 animate-spin" /> : <LogOut className="w-4 h-4" />}
        Cerrar sesión
      </button>
      <button
        onClick={onDeleteAccount}
        className="w-full py-3 rounded-xl text-sm font-bold border border-red-500/30 text-red-400 hover:bg-red-500/10 transition-all flex items-center justify-center gap-2"
      >
        <Trash2 className="w-4 h-4" />
        Eliminar cuenta
      </button>
    </div>
  )
}

// ─── Delete account section ───────────────────────────────────────────────────

function DeleteAccountSection() {
  const logout      = useAuthStore(s => s.logout)
  const queryClient = useQueryClient()
  const [password,    setPassword]    = useState('')
  const [showPass,    setShowPass]    = useState(false)
  const [deleting,    setDeleting]    = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDelete = async () => {
    if (!password) { setDeleteError('Ingresá tu contraseña'); return }
    setDeleting(true); setDeleteError(null)
    try {
      await deleteUserAccount(password)
      logout(); queryClient.clear()
      window.location.href = '/login'
    } catch (err: any) {
      const detail = err?.response?.data?.detail
      setDeleteError(typeof detail === 'string' ? detail : 'Contraseña incorrecta')
    } finally { setDeleting(false) }
  }

  return (
    <div className="px-6 py-6 space-y-5">
      <div className="bg-red-500/10 border border-red-500/30 rounded-xl p-4">
        <p className="text-sm text-red-300 leading-relaxed">
          Esta acción es <span className="font-bold">irreversible</span>. Se eliminarán permanentemente tu cuenta, transacciones, cuentas bancarias, metas y todos tus datos.
        </p>
      </div>

      <div>
        <label className="text-xs text-slate-400 block mb-1.5">Confirmá tu contraseña para continuar</label>
        <div className="relative">
          <input
            type={showPass ? 'text' : 'password'}
            value={password}
            onChange={e => setPassword(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleDelete()}
            placeholder="Contraseña actual"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 pr-10 text-sm text-slate-200 placeholder-slate-500 outline-none focus:border-red-500/60 transition-colors"
            autoFocus
          />
          <button
            type="button"
            onClick={() => setShowPass(v => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-300 transition-colors"
          >
            {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>
        {deleteError && <p className="text-xs text-red-400 mt-1.5">{deleteError}</p>}
      </div>

      <button
        onClick={handleDelete}
        disabled={deleting || !password}
        className="w-full py-3 bg-red-500/20 hover:bg-red-500/30 text-red-400 border border-red-500/30 rounded-xl text-sm font-bold transition-all disabled:opacity-40 flex items-center justify-center gap-2"
      >
        {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
        {deleting ? 'Eliminando...' : 'Eliminar mi cuenta'}
      </button>
    </div>
  )
}

// ─── Main drawer ──────────────────────────────────────────────────────────────

export default function SettingsDrawer({ open, onClose, initialSection }: Props) {
  const logout      = useAuthStore(s => s.logout)
  const queryClient = useQueryClient()

  const [section,       setSection]       = useState<Section>(null)
  const [acctModalOpen, setAcctModalOpen] = useState(false)
  const [goalModalOpen, setGoalModalOpen] = useState(false)
  const [editGoal,      setEditGoal]      = useState<FinGoal | undefined>(undefined)

  const { data: finGoalsForModal = [] } = useQuery({ queryKey: ['fin-goals'], queryFn: fetchFinGoals, enabled: open })

  const handleLogout = async () => {
    try { await logoutApi() } catch {}
    logout(); queryClient.clear()
    window.location.href = '/login'
  }

  // Navigate to initialSection when drawer opens; reset after close animation
  useEffect(() => {
    if (open) {
      setSection(initialSection ?? null)
    } else {
      const t = setTimeout(() => setSection(null), 350)
      return () => clearTimeout(t)
    }
  }, [open, initialSection])

  const sectionTitle: Record<NonNullable<Section>, string> = {
    perfil:           'Perfil',
    cuentas:          'Cuentas',
    etiquetas:        'Etiquetas',
    tasas:            'Tasas de cambio',
    metas:            'Metas financieras',
    'eliminar-cuenta':'Eliminar cuenta',
  }

  return (
    <>
      {/* Overlay */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />

      {/* Drawer panel */}
      <div className={`fixed top-0 right-0 z-50 h-full w-full max-w-sm bg-slate-900 border-l border-slate-800 flex flex-col transition-transform duration-300 ease-in-out ${open ? 'translate-x-0' : 'translate-x-full'}`}>

        {/* Header — fixed */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-800 shrink-0">
          {section !== null ? (
            <button
              onClick={() => setSection(null)}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group"
            >
              <ArrowLeft className="w-4 h-4 group-hover:-translate-x-0.5 transition-transform" />
              <span className="text-base font-semibold text-white">{sectionTitle[section]}</span>
            </button>
          ) : (
            <h2 className="text-base font-semibold text-white">Configuración</h2>
          )}
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto">
          {section === null      && <MainMenu      open={open} onNavigate={setSection} />}
          {section === 'perfil'  && <PerfilSection open={open} />}
          {section === 'cuentas' && <CuentasSection open={open} onNewAcct={() => setAcctModalOpen(true)} />}
          {section === 'etiquetas' && (
            <div className="px-6 py-6">
              <EtiquetasContent />
            </div>
          )}
          {section === 'tasas'            && <TasasSection open={open} />}
          {section === 'metas'            && (
            <MetasSection
              open={open}
              onNewGoal={() => { setEditGoal(undefined); setGoalModalOpen(true) }}
              onEditGoal={goal => { setEditGoal(goal); setGoalModalOpen(true) }}
            />
          )}
          {section === 'eliminar-cuenta' && <DeleteAccountSection />}
        </div>

        {/* Logout — only on main menu */}
        {section === null && (
          <MainFooter
            onDeleteAccount={() => setSection('eliminar-cuenta')}
            onLogout={handleLogout}
          />
        )}
      </div>

      {/* Modals rendered outside the drawer panel → no stacking context trap */}
      <AccountModal open={acctModalOpen} onClose={() => setAcctModalOpen(false)} />
      <GoalModal
        open={goalModalOpen}
        onClose={() => { setGoalModalOpen(false); setEditGoal(undefined) }}
        goal={editGoal}
        existingGoals={finGoalsForModal}
      />
    </>
  )
}
