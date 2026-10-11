import { useState, useEffect } from 'react'
import { X, Loader2, ChevronDown, Plus, Check, Home } from 'lucide-react'
import DatePicker from './DatePicker'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchAccounts,
  fetchCategories,
  fetchConcepts,
  fetchTransaction,
  createTransaction,
  updateTransaction,
  createInstalmentPlan,
  createAccount,
  createCategory,
  createConcept,
  fetchExchangeRates,
  type Account,
  type ExchangeRate,
  type PaymentMethod,
} from '../api/dashboard'
import { fetchHouseholds } from '../api/households'
import { invalidateFinancialData } from '../lib/queryClient'
import { useHomeCurrency } from '../hooks/useHomeCurrency'

interface Props {
  open: boolean
  onClose: () => void
  editTxId?: string
}

const PRESET_COLORS = [
  '#22d3ee', '#34d399', '#a78bfa', '#f43f5e', '#fb923c',
  '#facc15', '#60a5fa', '#f472b6', '#10b981', '#8b5cf6',
]

const inputClass =
  'bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500/60 transition-colors w-full'
const labelClass = 'text-xs text-slate-400 mb-1 block'

const METODO_LABELS: Record<string, string> = {
  efectivo: 'Efectivo', tarjeta_credito: 'Tarjeta de crédito',
  tarjeta_debito: 'Tarjeta de débito', transferencia_bancaria: 'Transferencia bancaria',
  billetera_digital: 'Billetera digital', otro: 'Otro',
}
const ACCT_TYPE_LABELS: Record<string, string> = {
  cash: 'Efectivo', debit: 'Débito', credit: 'Crédito', investment: 'Inversión',
}
const ddBtn   = 'w-full flex items-center justify-between bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm transition-colors text-left cursor-pointer'
const ddPanel = 'absolute top-full left-0 mt-1 z-[200] w-full bg-slate-900 border border-slate-700 rounded-xl shadow-xl py-1 overflow-y-auto max-h-52'

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function parseErr(err: unknown, fallback: string): string {
  const e = err as any
  if (!e?.response) return 'Sin conexión con el servidor — verificá que el backend esté activo'
  const detail = e.response?.data?.detail
  if (!detail) return fallback
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((x: unknown) => (x as { msg?: string })?.msg ?? String(x)).join('. ')
  return fallback
}

// ─── Mini inline form for quick concept/category creation ───────────────────

interface QuickCreateConceptProps {
  onCreated: (id: string) => void
  onCancel: () => void
}

function QuickCreateConcept({ onCreated, onCancel }: QuickCreateConceptProps) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    const trimmed = name.trim()
    if (trimmed.length < 2) { setError('Mínimo 2 caracteres'); return }
    setSaving(true); setError(null)
    try {
      const created = await createConcept({ name: trimmed })
      await queryClient.invalidateQueries({ queryKey: ['concepts'] })
      onCreated(created.id)
    } catch (err) {
      setError(parseErr(err, 'No se pudo crear el concepto'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-2 p-3 bg-slate-800/80 border border-slate-700/70 rounded-xl space-y-2">
      <input
        autoFocus
        type="text"
        value={name}
        onChange={e => setName(e.target.value.toUpperCase())}
        onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onCancel() }}
        placeholder="NOMBRE DEL CONCEPTO"
        className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500/60 transition-colors w-full font-mono tracking-wide"
      />
      {error && <p className="text-rose-400 text-[10px]">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="flex-1 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-400 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          Crear
        </button>
        <button
          onClick={onCancel}
          className="py-1.5 px-3 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 text-slate-400 rounded-lg text-xs transition-all"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

interface QuickCreateCategoryProps {
  onCreated: (id: string) => void
  onCancel: () => void
}

function QuickCreateCategory({ onCreated, onCancel }: QuickCreateCategoryProps) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    const trimmed = name.trim()
    if (trimmed.length < 2) { setError('Mínimo 2 caracteres'); return }
    setSaving(true); setError(null)
    try {
      const created = await createCategory({ name: trimmed, color })
      await queryClient.invalidateQueries({ queryKey: ['categories'] })
      onCreated(created.id)
    } catch (err) {
      setError(parseErr(err, 'No se pudo crear la categoría'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="mt-2 p-3 bg-slate-800/80 border border-slate-700/70 rounded-xl space-y-2">
      <input
        autoFocus
        type="text"
        value={name}
        onChange={e => {
          const v = e.target.value
          setName(v.length > 0 ? v.charAt(0).toUpperCase() + v.slice(1) : v)
        }}
        onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onCancel() }}
        placeholder="Nombre de la categoría"
        className="bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500/60 transition-colors w-full"
      />
      <div className="flex gap-1.5 flex-wrap">
        {PRESET_COLORS.map(c => (
          <button
            key={c}
            onClick={() => setColor(c)}
            className="w-5 h-5 rounded-full transition-all"
            style={{
              background: c,
              outline: color === c ? `2px solid ${c}` : undefined,
              outlineOffset: color === c ? '2px' : undefined,
              opacity: color === c ? 1 : 0.45,
            }}
          />
        ))}
      </div>
      {error && <p className="text-rose-400 text-[10px]">{error}</p>}
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          disabled={saving}
          className="flex-1 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-400 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 disabled:opacity-50"
        >
          {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}
          Crear
        </button>
        <button
          onClick={onCancel}
          className="py-1.5 px-3 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 text-slate-400 rounded-lg text-xs transition-all"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}

/** Tasa from→to para el mes de `date`: la del mes o la anterior más reciente; si no, la primera posterior. Soporta par inverso. */
function findRate(rates: ExchangeRate[], from: string, to: string, date: string): number | null {
  const key = Number(date.slice(0, 4)) * 12 + Number(date.slice(5, 7))
  const candidates = rates
    .map(r => r.from_currency === from && r.to_currency === to ? { k: r.year * 12 + r.month, rate: Number(r.rate) }
      : r.from_currency === to && r.to_currency === from ? { k: r.year * 12 + r.month, rate: 1 / Number(r.rate) }
      : null)
    .filter((c): c is { k: number; rate: number } => c !== null)
  if (candidates.length === 0) return null
  const past = candidates.filter(c => c.k <= key).sort((a, b) => b.k - a.k)
  if (past.length) return past[0].rate
  return candidates.sort((a, b) => a.k - b.k)[0].rate
}

/** "1 USD = 40.50 UYU" — siempre expresado con la moneda más fuerte a la izquierda. rate = cuántos `to` por 1 `from`. */
function fmtRate(rate: number, from: string, to: string): string {
  return rate >= 1 ? `1 ${from} = ${rate.toFixed(2)} ${to}` : `1 ${to} = ${(1 / rate).toFixed(2)} ${from}`
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function TransactionModal({ open, onClose, editTxId }: Props) {
  const isEditing    = !!editTxId
  const queryClient  = useQueryClient()
  const homeCurrency = useHomeCurrency()
  const currencyOpts = [...new Set([homeCurrency, 'USD', 'EUR'])]

  // 'withdrawal' (Retiro) es una transferencia hacia una cuenta de efectivo: misma lógica, otra pantalla
  const [txType, setTxType] = useState<'income' | 'expense' | 'transfer' | 'withdrawal'>('expense')
  const isMove = txType === 'transfer' || txType === 'withdrawal'

  const [accountId,   setAccountId]   = useState('')
  const [conceptId,   setConceptId]   = useState('')
  const [categoryId,  setCategoryId]  = useState('')
  const [amount,      setAmount]      = useState('')
  const [date,        setDate]        = useState(today())
  const [description, setDescription] = useState('')
  const [destAccountId, setDestAccountId] = useState('')
  const [submitting,  setSubmitting]  = useState(false)
  const [serverError, setServerError] = useState<string | null>(null)

  // Expense payment method
  const [metodoPago, setMetodoPago] = useState<PaymentMethod>('efectivo')

  // Comisión de transferencia
  const [commission, setCommission] = useState('')
  // Transferencia entre monedas: monto que llega a la cuenta destino
  const [destAmount, setDestAmount] = useState('')

  // Cuotas
  const [enCuotas,  setEnCuotas]  = useState(false)
  const [nCuotas,   setNCuotas]   = useState('2')

  // Household (F04: múltiples hogares)
  const [selectedHouseholdIds, setSelectedHouseholdIds] = useState<string[]>([])

  // Quick-create panels
  const [showNewConcept,  setShowNewConcept]  = useState(false)
  const [showNewCategory, setShowNewCategory] = useState(false)

  const [openDd, setOpenDd] = useState<string | null>(null)
  const closeDd = () => setTimeout(() => setOpenDd(null), 150)

  // Inline account creation state
  const [acctName,     setAcctName]     = useState('')
  const [acctType,     setAcctType]     = useState('cash')
  const [acctCurrency, setAcctCurrency] = useState(homeCurrency)
  const [acctBalance,  setAcctBalance]  = useState('')
  const [acctLimit,    setAcctLimit]    = useState('')
  const [creatingAcct, setCreatingAcct] = useState(false)
  const [acctError,    setAcctError]    = useState<string | null>(null)

  const { data: accounts    = [] } = useQuery({ queryKey: ['accounts'],    queryFn: fetchAccounts,    enabled: open })
  const { data: categories  = [] } = useQuery({ queryKey: ['categories'],  queryFn: fetchCategories,  enabled: open })
  const { data: concepts    = [] } = useQuery({ queryKey: ['concepts'],    queryFn: fetchConcepts,    enabled: open })
  const { data: households  = [] } = useQuery({ queryKey: ['households'],  queryFn: fetchHouseholds,  enabled: open })
  const { data: rates       = [] } = useQuery({ queryKey: ['exchange-rates'], queryFn: fetchExchangeRates, enabled: open && isMove })
  // staleTime 0 + refetch al abrir: al reabrir un movimiento recién editado
  // no se deben mostrar (ni re-guardar) los valores viejos del caché.
  const { data: editTx      }      = useQuery({
    queryKey: ['tx', editTxId], queryFn: () => fetchTransaction(editTxId!),
    enabled: !!editTxId && open, staleTime: 0, refetchOnMount: 'always', refetchOnWindowFocus: false,
  })

  useEffect(() => {
    if (accounts.length > 0 && !accountId && !isEditing) {
      const first = accounts[0]
      setAccountId(first.id)
      if (txType === 'expense') {
        if (first.type === 'cash')   setMetodoPago('efectivo')
        if (first.type === 'debit')  setMetodoPago('tarjeta_debito')
        if (first.type === 'credit') setMetodoPago('tarjeta_credito')
      }
    }
  }, [accounts])

  // Pre-fill fields when editing an existing transaction
  useEffect(() => {
    if (!editTx) return
    setTxType(editTx.type)
    setAccountId(editTx.account_id)
    setConceptId(editTx.concept_id)
    setCategoryId(editTx.category_id)
    setAmount(String(editTx.amount))
    setDate(editTx.date)
    setDescription(editTx.description ?? '')
    setMetodoPago(editTx.metodo_pago)
    // F04: restaurar household_ids al editar
    setSelectedHouseholdIds(editTx.household_ids ?? (editTx.household_id ? [editTx.household_id] : []))
  }, [editTx, open])

  // Cuando se abre un modal nuevo (no edición), limpiar la selección
  useEffect(() => {
    if (open && !isEditing) setSelectedHouseholdIds([])
  }, [open, isEditing])

  useEffect(() => { setDestAccountId('') }, [accountId])
  useEffect(() => { setDestAmount('') }, [accountId, destAccountId])

  const destOptions  = accounts.filter(a => a.id !== accountId && (txType === 'withdrawal' ? a.type === 'cash' : a.type !== 'cash'))
  const srcAccount   = accounts.find(a => a.id === accountId)
  const destAccount  = accounts.find(a => a.id === destAccountId)
  const crossCurrency = isMove && !!srcAccount && !!destAccount && srcAccount.currency !== destAccount.currency
  const crossRate    = crossCurrency ? findRate(rates, srcAccount!.currency, destAccount!.currency, date) : null
  const estDestAmount = crossRate !== null && parseFloat(amount) > 0 ? (parseFloat(amount) * crossRate).toFixed(2) : null

  useEffect(() => {
    if (!open) {
      setTxType('expense')
      setAccountId(''); setConceptId(''); setCategoryId('')
      setAmount(''); setDate(today()); setDescription('')
      setDestAccountId(''); setServerError(null)
      setShowNewConcept(false); setShowNewCategory(false)
      setAcctName(''); setAcctType('cash'); setAcctCurrency(homeCurrency)
      setAcctBalance(''); setAcctLimit(''); setAcctError(null)
      setMetodoPago('efectivo')
      setCommission('')
      setDestAmount('')
      setEnCuotas(false); setNCuotas('2')
      setSelectedHouseholdIds([])
    }
  }, [open])

  const handleCreateAccount = async () => {
    if (!acctName.trim()) { setAcctError('El nombre es requerido'); return }
    const bal = acctBalance === '' ? 0 : parseFloat(acctBalance)
    if (isNaN(bal) || bal < 0) { setAcctError('El saldo inicial debe ser un número válido'); return }
    if (acctType === 'credit') {
      const lim = parseFloat(acctLimit)
      if (isNaN(lim) || lim <= 0) { setAcctError('El límite de crédito debe ser mayor a 0'); return }
    }
    setCreatingAcct(true); setAcctError(null)
    try {
      const payload: Parameters<typeof createAccount>[0] = {
        name: acctName.trim(), type: acctType, currency: acctCurrency, balance: bal,
      }
      if (acctType === 'credit') payload.credit_limit = parseFloat(acctLimit)
      const newAcct: Account = await createAccount(payload)
      await invalidateFinancialData(queryClient)
      setAccountId(newAcct.id)
      setAcctName(''); setAcctBalance(''); setAcctLimit('')
    } catch (err) {
      setAcctError(parseErr(err, 'No se pudo crear la cuenta'))
    } finally {
      setCreatingAcct(false)
    }
  }

  const handleSubmit = async () => {
    setServerError(null)
    if (!categoryId) { setServerError('Seleccioná una categoría'); return }
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { setServerError('El monto debe ser mayor a 0'); return }
    if (!date) { setServerError('La fecha es requerida'); return }
    if (!isEditing) {
      if (!accountId) { setServerError('Seleccioná una cuenta'); return }
      if (isMove && !destAccountId) {
        setServerError(txType === 'withdrawal' ? 'Elegí la cuenta de efectivo donde queda la plata' : 'Seleccioná la cuenta destino'); return
      }
      if (crossCurrency && !(parseFloat(destAmount) > 0) && crossRate === null) {
        setServerError(`Indicá cuánto llegó en ${destAccount!.currency} o cargá la tasa de cambio`); return
      }
      if (enCuotas && txType === 'expense') {
        const n = parseInt(nCuotas)
        if (isNaN(n) || n < 2 || n > 60) { setServerError('Las cuotas deben ser entre 2 y 60'); return }
      }
    }
    setSubmitting(true)
    try {
      if (isEditing) {
        await updateTransaction(editTxId!, {
          amount:       amt,
          date,
          description:  description.trim() || null,
          concept_id:   conceptId || undefined,
          category_id:  categoryId,
          ...(txType === 'expense' ? { metodo_pago: metodoPago, household_ids: selectedHouseholdIds } : {}),
        })
        queryClient.removeQueries({ queryKey: ['tx', editTxId] })
      } else if (enCuotas && txType === 'expense') {
        await createInstalmentPlan({
          account_id:   accountId,
          concept_id:   conceptId || null,
          category_id:  categoryId,
          total_amount: amt,
          n_cuotas:     parseInt(nCuotas),
          fecha_inicio: date,
          description:  description.trim() || undefined,
          metodo_pago:  metodoPago,
        })
      } else {
        await createTransaction({
          account_id:  accountId,
          concept_id:  conceptId || null,
          category_id: categoryId,
          amount:      amt,
          type:        isMove ? 'transfer' : txType,
          date,
          description: description.trim() || undefined,
          ...(isMove && destAccountId
            ? { transfer_to_account_id: destAccountId }
            : {}),
          ...(isMove && commission && parseFloat(commission) > 0
            ? { commission: parseFloat(commission) }
            : {}),
          ...(crossCurrency && parseFloat(destAmount) > 0
            ? { destination_amount: parseFloat(destAmount) }
            : {}),
          ...(txType === 'expense' ? { metodo_pago: metodoPago } : {}),
          ...(txType === 'expense' && selectedHouseholdIds.length > 0 ? { household_ids: selectedHouseholdIds } : {}),
        })
      }
      await invalidateFinancialData(queryClient)
      onClose()
    } catch (err) {
      setServerError(parseErr(err, isEditing ? 'No se pudo guardar los cambios' : 'No se pudo registrar el movimiento'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  const noAccounts = accounts.length === 0

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl max-h-[90vh] overflow-y-auto [scrollbar-width:thin] [scrollbar-color:theme(colors.slate.700)_transparent]">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">{isEditing ? 'Editar Movimiento' : 'Registrar Movimiento'}</h2>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tipo toggle — deshabilitado en modo edición */}
        <div className="flex gap-2 mb-5">
          {(['income', 'expense', 'transfer', 'withdrawal'] as const).map(type => {
            const labels = { income: 'Ingreso', expense: 'Gasto', transfer: 'Transferencia', withdrawal: 'Retiro' }
            const activeStyles = {
              income:     'bg-cyan-400/15 border-cyan-400/40 text-cyan-400',
              expense:    'bg-rose-400/15 border-rose-400/40 text-rose-400',
              transfer:   'bg-amber-400/15 border-amber-400/40 text-amber-400',
              withdrawal: 'bg-lime-400/15 border-lime-400/40 text-lime-400',
            }
            const isActive = txType === type
            return (
              <button
                key={type}
                disabled={isEditing}
                onClick={() => { if (!isEditing) { setTxType(type); setDestAccountId(''); if (type !== 'expense') { setSelectedHouseholdIds([]) } } }}
                className={`flex-1 py-2 px-1 leading-tight rounded-xl text-xs sm:text-sm font-semibold border transition-all ${
                  isActive
                    ? activeStyles[type]
                    : isEditing
                      ? 'bg-slate-800/30 border-slate-700/30 text-slate-600 cursor-default'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200 hover:border-slate-600'
                }`}
              >
                {labels[type]}
              </button>
            )
          })}
        </div>

        {/* Inline account creation when no accounts exist */}
        {noAccounts && (
          <div className="mb-5 p-4 bg-slate-800/60 border border-slate-700/50 rounded-2xl">
            <p className="text-xs text-slate-400 mb-4">No tenés cuentas aún. Creá una para continuar.</p>
            <div className="space-y-3">
              <div>
                <label className={labelClass}>Nombre de la cuenta</label>
                <input type="text" value={acctName} onChange={e => setAcctName(e.target.value)}
                  placeholder="Ej: Efectivo, Santander..." className={inputClass} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={labelClass}>Tipo</label>
                  <div className="relative">
                    <button
                      onClick={() => setOpenDd(openDd === 'acctType' ? null : 'acctType')}
                      onBlur={closeDd}
                      className={`${ddBtn} text-slate-200`}
                    >
                      <span>{ACCT_TYPE_LABELS[acctType] ?? acctType}</span>
                      <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 ml-2" />
                    </button>
                    {openDd === 'acctType' && (
                      <div className={ddPanel}>
                        {Object.entries(ACCT_TYPE_LABELS).map(([val, label]) => (
                          <button key={val} onMouseDown={e => e.preventDefault()}
                            onClick={() => { setAcctType(val); setOpenDd(null) }}
                            className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-slate-800 flex items-center justify-between ${acctType === val ? 'text-slate-200 font-semibold' : 'text-slate-400'}`}>
                            {label}
                            {acctType === val && <span className="text-emerald-400 text-[10px]">✓</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Moneda</label>
                  <div className="relative">
                    <button
                      onClick={() => setOpenDd(openDd === 'acctCurrency' ? null : 'acctCurrency')}
                      onBlur={closeDd}
                      className={`${ddBtn} text-slate-200`}
                    >
                      <span>{acctCurrency}</span>
                      <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 ml-2" />
                    </button>
                    {openDd === 'acctCurrency' && (
                      <div className={ddPanel}>
                        {currencyOpts.map(c => (
                          <button key={c} onMouseDown={e => e.preventDefault()}
                            onClick={() => { setAcctCurrency(c); setOpenDd(null) }}
                            className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-slate-800 flex items-center justify-between ${acctCurrency === c ? 'text-slate-200 font-semibold' : 'text-slate-400'}`}>
                            {c}
                            {acctCurrency === c && <span className="text-emerald-400 text-[10px]">✓</span>}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
              {acctType !== 'credit' && (
                <div>
                  <label className={labelClass}>Saldo inicial</label>
                  <input type="number" min="0" step="0.01" value={acctBalance}
                    onChange={e => setAcctBalance(e.target.value)} placeholder="0.00" className={inputClass} />
                </div>
              )}
              {acctType === 'credit' && (
                <div>
                  <label className={labelClass}>Límite de crédito</label>
                  <input type="number" min="0.01" step="0.01" value={acctLimit}
                    onChange={e => setAcctLimit(e.target.value)} placeholder="0.00" className={inputClass} />
                </div>
              )}
              {acctError && <p className="text-rose-400 text-xs mt-1">{acctError}</p>}
              <button onClick={handleCreateAccount} disabled={creatingAcct}
                className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2">
                {creatingAcct && <Loader2 className="w-4 h-4 animate-spin" />}
                Crear cuenta
              </button>
            </div>
          </div>
        )}

        {/* Transaction form */}
        {!noAccounts && (
          <div className="space-y-4">

            {/* Cuenta — read-only en modo edición */}
            <div>
              <label className={labelClass}>Cuenta {isEditing && <span className="text-slate-600">(no editable)</span>}</label>
              <div className="relative">
                <button
                  onClick={() => !isEditing && setOpenDd(openDd === 'account' ? null : 'account')}
                  onBlur={closeDd}
                  className={`${ddBtn} ${isEditing ? 'opacity-50 cursor-default' : ''} ${accountId ? 'text-slate-200' : 'text-slate-500'}`}
                >
                  <span className="truncate">
                    {accountId
                      ? (() => { const a = accounts.find(a => a.id === accountId); return a ? `${a.name} · ${a.currency} · ${Number(a.balance).toLocaleString()}` : '—' })()
                      : 'Seleccioná una cuenta'}
                  </span>
                  <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 ml-2" />
                </button>
                {openDd === 'account' && (
                  <div className={ddPanel}>
                    {accounts.map(acc => (
                      <button key={acc.id} onMouseDown={e => e.preventDefault()}
                        onClick={() => {
                          setAccountId(acc.id)
                          if (txType === 'expense') {
                            if (acc.type === 'cash')   { setMetodoPago('efectivo');       setEnCuotas(false) }
                            if (acc.type === 'debit')  { setMetodoPago('tarjeta_debito'); setEnCuotas(false) }
                            if (acc.type === 'credit') { setMetodoPago('tarjeta_credito') }
                          }
                          setOpenDd(null)
                        }}
                        className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-slate-800 flex items-center justify-between ${accountId === acc.id ? 'text-slate-200 font-semibold' : 'text-slate-400'}`}>
                        <span className="truncate">{acc.name} · {acc.currency} · {Number(acc.balance).toLocaleString()}</span>
                        {accountId === acc.id && <span className="text-emerald-400 text-[10px] shrink-0 ml-2">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Cuenta destino — transferencias (a otra cuenta) y retiros (a efectivo) */}
            {isMove && (
              <div>
                <label className={labelClass}>{txType === 'withdrawal' ? 'Efectivo donde queda la plata' : 'Cuenta destino'}</label>
                <div className="relative">
                  <button
                    onClick={() => setOpenDd(openDd === 'destAccount' ? null : 'destAccount')}
                    onBlur={closeDd}
                    className={`${ddBtn} ${destAccountId ? 'text-slate-200' : 'text-slate-500'}`}
                  >
                    <span className="truncate">
                      {destAccountId
                        ? (() => { const a = accounts.find(a => a.id === destAccountId); return a ? `${a.name} · ${a.currency} · ${Number(a.balance).toLocaleString()}` : '—' })()
                        : txType === 'withdrawal' ? 'Elegí tu efectivo' : 'Seleccioná una cuenta'}
                    </span>
                    <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 ml-2" />
                  </button>
                  {openDd === 'destAccount' && (
                    <div className={ddPanel}>
                      {destOptions.length === 0 && (
                        <p className="px-4 py-2 text-xs text-slate-500">
                          {txType === 'withdrawal'
                            ? 'No tenés cuentas de efectivo. Creá una (ej: Efectivo USD) en Configuración → Cuentas.'
                            : 'No hay otra cuenta. Para sacar efectivo usá Retiro.'}
                        </p>
                      )}
                      {destOptions.map(a => (
                        <button key={a.id} onMouseDown={e => e.preventDefault()}
                          onClick={() => { setDestAccountId(a.id); setOpenDd(null) }}
                          className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-slate-800 flex items-center justify-between ${destAccountId === a.id ? 'text-slate-200 font-semibold' : 'text-slate-400'}`}>
                          <span className="truncate">{a.name} · {a.currency} · {Number(a.balance).toLocaleString()}</span>
                          {destAccountId === a.id && <span className="text-emerald-400 text-[10px] shrink-0 ml-2">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {isMove && !crossCurrency && (
              <p className="text-[11px] text-slate-500 -mt-2">
                {destAccount
                  ? `Las dos cuentas son en ${destAccount.currency}: llega el mismo monto.`
                  : txType === 'withdrawal'
                    ? 'Si sacás en otra moneda (ej: dólares desde una cuenta en pesos), te vamos a pedir cuánto recibiste.'
                    : 'Si la cuenta destino es en otra moneda, te vamos a pedir cuánto llegó.'}
              </p>
            )}

            {/* Cambio de moneda: un solo bloque con lo que sale y lo que llega (reemplaza al campo Monto) */}
            {crossCurrency && (
              <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
                <p className="text-xs font-medium text-amber-300 mb-2">Cambio de moneda</p>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Sale de {srcAccount!.name} ({srcAccount!.currency})
                    </label>
                    <input type="number" min="0.01" step="0.01" value={amount}
                      onChange={e => setAmount(e.target.value)} placeholder="0.00" className={inputClass} />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">
                      Llega a {destAccount!.name} ({destAccount!.currency})
                    </label>
                    <input type="number" min="0" step="0.01" value={destAmount}
                      onChange={e => setDestAmount(e.target.value)} placeholder={estDestAmount ?? '0.00'} className={inputClass} />
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  {parseFloat(destAmount) > 0 && parseFloat(amount) > 0
                    ? `Cambio aplicado: ${fmtRate(parseFloat(destAmount) / parseFloat(amount), srcAccount!.currency, destAccount!.currency)}`
                    : crossRate !== null
                      ? `Si dejás vacío lo que llega, se calcula con tu tasa: ${fmtRate(crossRate, srcAccount!.currency, destAccount!.currency)}`
                      : `No tenés tasa ${srcAccount!.currency}→${destAccount!.currency} cargada: indicá cuánto llegó`}
                </p>
              </div>
            )}

            {/* Comisión — transferencias y retiros */}
            {isMove && (
              <div>
                <label className={labelClass}>
                  Comisión bancaria{srcAccount ? ` (${srcAccount.currency}, se descuenta de ${srcAccount.name})` : ''}{' '}
                  <span className="text-slate-600">(opcional)</span>
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={commission}
                  onChange={e => setCommission(e.target.value)}
                  placeholder="0.00"
                  className={inputClass}
                />
              </div>
            )}

            {/* Concepto (opcional) */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelClass + ' mb-0'}>Concepto <span className="text-slate-600">(opcional)</span></label>
                <button
                  onClick={() => { setShowNewConcept(v => !v); setShowNewCategory(false) }}
                  className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Nuevo
                </button>
              </div>
              <div className="relative">
                <button
                  onClick={() => setOpenDd(openDd === 'concept' ? null : 'concept')}
                  onBlur={closeDd}
                  className={`${ddBtn} ${conceptId ? 'text-slate-200' : 'text-slate-500'}`}
                >
                  <span className="truncate">{conceptId ? concepts.find(c => c.id === conceptId)?.name ?? 'Sin concepto' : 'Sin concepto'}</span>
                  <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 ml-2" />
                </button>
                {openDd === 'concept' && (
                  <div className={ddPanel}>
                    <button onMouseDown={e => e.preventDefault()} onClick={() => { setConceptId(''); setOpenDd(null) }}
                      className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-slate-800 flex items-center justify-between ${!conceptId ? 'text-slate-200 font-semibold' : 'text-slate-400'}`}>
                      Sin concepto {!conceptId && <span className="text-emerald-400 text-[10px]">✓</span>}
                    </button>
                    {concepts.map(c => (
                      <button key={c.id} onMouseDown={e => e.preventDefault()} onClick={() => { setConceptId(c.id); setOpenDd(null) }}
                        className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-slate-800 flex items-center justify-between ${conceptId === c.id ? 'text-slate-200 font-semibold' : 'text-slate-400'}`}>
                        <span className="truncate">{c.name}</span>
                        {conceptId === c.id && <span className="text-emerald-400 text-[10px] shrink-0 ml-2">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {showNewConcept && (
                <QuickCreateConcept
                  onCreated={id => { setConceptId(id); setShowNewConcept(false) }}
                  onCancel={() => setShowNewConcept(false)}
                />
              )}
            </div>

            {/* Categoría */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelClass + ' mb-0'}>Categoría</label>
                <button
                  onClick={() => { setShowNewCategory(v => !v); setShowNewConcept(false) }}
                  className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Nueva
                </button>
              </div>
              <div className="relative">
                <button
                  onClick={() => setOpenDd(openDd === 'category' ? null : 'category')}
                  onBlur={closeDd}
                  className={`${ddBtn} ${categoryId ? 'text-slate-200' : 'text-slate-500'}`}
                >
                  <span className="truncate">{categoryId ? categories.find(c => c.id === categoryId)?.name ?? 'Seleccioná una categoría' : 'Seleccioná una categoría'}</span>
                  <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 ml-2" />
                </button>
                {openDd === 'category' && (
                  <div className={ddPanel}>
                    {categories.map(cat => (
                      <button key={cat.id} onMouseDown={e => e.preventDefault()} onClick={() => { setCategoryId(cat.id); setOpenDd(null) }}
                        className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-slate-800 flex items-center justify-between ${categoryId === cat.id ? 'text-slate-200 font-semibold' : 'text-slate-400'}`}>
                        <span className="truncate">{cat.name}</span>
                        {categoryId === cat.id && <span className="text-emerald-400 text-[10px] shrink-0 ml-2">✓</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {showNewCategory && (
                <QuickCreateCategory
                  onCreated={id => { setCategoryId(id); setShowNewCategory(false) }}
                  onCancel={() => setShowNewCategory(false)}
                />
              )}
            </div>

            {/* Método de pago — solo para Gastos */}
            {txType === 'expense' && (
              <div>
                <label className={labelClass}>Método de pago</label>
                <div className="relative">
                  <button
                    onClick={() => setOpenDd(openDd === 'metodo' ? null : 'metodo')}
                    onBlur={closeDd}
                    className={`${ddBtn} text-slate-200`}
                  >
                    <span>{METODO_LABELS[metodoPago] ?? metodoPago}</span>
                    <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 ml-2" />
                  </button>
                  {openDd === 'metodo' && (
                    <div className={ddPanel}>
                      {Object.entries(METODO_LABELS).map(([val, label]) => (
                        <button key={val} onMouseDown={e => e.preventDefault()}
                          onClick={() => {
                            const v = val as PaymentMethod
                            setMetodoPago(v)
                            if (v !== 'tarjeta_credito') setEnCuotas(false)
                            setOpenDd(null)
                          }}
                          className={`w-full text-left px-4 py-2 text-sm transition-colors hover:bg-slate-800 flex items-center justify-between ${metodoPago === val ? 'text-slate-200 font-semibold' : 'text-slate-400'}`}>
                          {label}
                          {metodoPago === val && <span className="text-emerald-400 text-[10px]">✓</span>}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Cuotas — solo para gastos con tarjeta de crédito */}
            {txType === 'expense' && metodoPago === 'tarjeta_credito' && (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className={labelClass + ' mb-0'}>¿En cuotas?</label>
                  <button
                    type="button"
                    onClick={() => setEnCuotas(v => !v)}
                    className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
                      enCuotas ? 'bg-emerald-500' : 'bg-slate-700'
                    }`}
                  >
                    <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
                      enCuotas ? 'translate-x-4' : 'translate-x-1'
                    }`} />
                  </button>
                </div>
                {enCuotas && (
                  <div>
                    <label className={labelClass}>Número de cuotas</label>
                    <input
                      type="number"
                      min="2"
                      max="60"
                      step="1"
                      value={nCuotas}
                      onChange={e => setNCuotas(e.target.value)}
                      className={inputClass}
                    />
                    {amount && !isNaN(parseFloat(amount)) && parseInt(nCuotas) >= 2 && (
                      <p className="text-xs text-slate-500 mt-1">
                        ≈ {(parseFloat(amount) / parseInt(nCuotas)).toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} por cuota
                      </p>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Monto (en un cambio de moneda se carga arriba, en el bloque "Cambio de moneda") */}
            {!crossCurrency && (
              <div>
                <label className={labelClass}>
                  {txType === 'transfer' ? 'Monto a transferir' : txType === 'withdrawal' ? 'Monto que sacás' : 'Monto'}
                </label>
                <input type="number" min="0.01" step="0.01" value={amount}
                  onChange={e => setAmount(e.target.value)} placeholder="0.00" className={inputClass} />
              </div>
            )}

            {/* Fecha */}
            <div>
              <label className={labelClass}>Fecha</label>
              <DatePicker value={date} onChange={setDate} />
            </div>

            {/* Hogares — multi-select, solo para gastos (F04) */}
            {txType === 'expense' && (
              <div className="space-y-1.5">
                <p className="text-xs text-slate-500 flex items-center gap-1.5">
                  <Home className="w-3.5 h-3.5" />
                  {households.length === 0 ? 'Creá un hogar para asociar este gasto' : 'Asociar a hogares (opcional)'}
                </p>
                {households.length > 0 && (
                  <div className="grid grid-cols-1 gap-1.5">
                    {households.map(hh => {
                      const selected = selectedHouseholdIds.includes(hh.id)
                      return (
                        <label key={hh.id}
                          className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border cursor-pointer transition-all ${
                            selected ? 'bg-indigo-500/15 border-indigo-500/40' : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                          }`}>
                          <input
                            type="checkbox"
                            checked={selected}
                            onChange={() => setSelectedHouseholdIds(prev =>
                              prev.includes(hh.id) ? prev.filter(id => id !== hh.id) : [...prev, hh.id]
                            )}
                            className="accent-indigo-500 w-3.5 h-3.5 shrink-0"
                          />
                          <span className={`text-sm truncate ${selected ? 'text-indigo-300 font-medium' : 'text-slate-400'}`}>
                            {hh.name}
                          </span>
                          {selected && <Check className="w-3.5 h-3.5 text-indigo-400 ml-auto shrink-0" />}
                        </label>
                      )
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Descripción */}
            <div>
              <label className={labelClass}>Descripción (opcional)</label>
              <input type="text" value={description}
                onChange={e => setDescription(e.target.value.slice(0, 100))}
                placeholder="Ej: Supermercado del sábado" maxLength={100} className={inputClass} />
            </div>

            {serverError && <p className="text-rose-400 text-xs mt-1">{serverError}</p>}

            <button
              onClick={handleSubmit}
              disabled={submitting}
              className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 mt-2"
            >
              {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
              {isEditing ? 'Guardar cambios' : 'Registrar'}
            </button>
          </div>
        )}
      </div>

    </div>
  )
}
