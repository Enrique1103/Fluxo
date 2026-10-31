import { useState, useEffect } from 'react'
import { X, Loader2, ChevronDown, Plus, Check, Home } from 'lucide-react'
import DatePicker from './DatePicker'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchAccounts,
  withoutArchived,
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
  conceptsForType,
  CATEGORY_KIND_LABELS,
  type Account,
  type Category,
  type CategoryKind,
  type PaymentMethod,
} from '../api/dashboard'
import { fetchHouseholds } from '../api/households'
import { findRate, fmtRate } from '../utils/rates'
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
  /** Categorías que sirven para el tipo de movimiento actual */
  categories: Category[]
  /** Tipo de categoría sugerido si se crea una nueva desde acá */
  defaultKind: CategoryKind
  onCreated: (id: string) => void
  onCancel: () => void
}

// Todo concepto nuevo se crea dentro de una categoría: después, al elegirlo,
// la categoría del movimiento se completa sola.
function QuickCreateConcept({ categories, defaultKind, onCreated, onCancel }: QuickCreateConceptProps) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    const trimmed = name.trim()
    if (trimmed.length < 2) { setError('Mínimo 2 caracteres'); return }
    if (!categoryId) { setError('Elegí a qué categoría pertenece'); return }
    setSaving(true); setError(null)
    try {
      const created = await createConcept({ name: trimmed, category_id: categoryId })
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
      <div className="flex gap-2">
        <select
          value={categoryId}
          onChange={e => setCategoryId(e.target.value)}
          className="flex-1 min-w-0 bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-xs text-slate-200 outline-none focus:border-emerald-500/60"
        >
          <option value="">Categoría…</option>
          {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <button
          onClick={() => setShowNewCategory(v => !v)}
          className="shrink-0 flex items-center gap-1 px-2 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors"
        >
          <Plus className="w-3 h-3" /> Nueva
        </button>
      </div>
      {showNewCategory && (
        <QuickCreateCategory
          defaultKind={defaultKind}
          onCreated={id => { setCategoryId(id); setShowNewCategory(false) }}
          onCancel={() => setShowNewCategory(false)}
        />
      )}
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
  defaultKind: CategoryKind
  onCreated: (id: string) => void
  onCancel: () => void
}

function QuickCreateCategory({ defaultKind, onCreated, onCancel }: QuickCreateCategoryProps) {
  const queryClient = useQueryClient()
  const [name, setName] = useState('')
  const [color, setColor] = useState(PRESET_COLORS[0])
  const [kind, setKind] = useState<CategoryKind>(defaultKind)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async () => {
    const trimmed = name.trim()
    if (trimmed.length < 2) { setError('Mínimo 2 caracteres'); return }
    setSaving(true); setError(null)
    try {
      const created = await createCategory({ name: trimmed, color, kind })
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
      <div className="flex gap-1 flex-wrap">
        <span className="text-[10px] text-slate-500 self-center mr-1">Se usa para:</span>
        {(Object.keys(CATEGORY_KIND_LABELS) as CategoryKind[]).map(k => (
          <button
            key={k}
            onClick={() => setKind(k)}
            className={`px-2 py-0.5 rounded-md text-[10px] border transition-colors ${kind === k ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300' : 'border-slate-600 text-slate-400 hover:text-slate-200'}`}
          >
            {CATEGORY_KIND_LABELS[k]}
          </button>
        ))}
      </div>
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

// ─── Main component ──────────────────────────────────────────────────────────

export default function TransactionModal({ open, onClose, editTxId }: Props) {
  const isEditing    = !!editTxId
  const queryClient  = useQueryClient()
  const homeCurrency = useHomeCurrency()
  const currencyOpts = [...new Set([homeCurrency, 'USD', 'EUR'])]

  // 'withdrawal' ya no se elige en pantalla (todo es Transferencia); se mantiene el tipo por compatibilidad
  const [txType, setTxType] = useState<'income' | 'expense' | 'transfer' | 'withdrawal'>('expense')
  const isMove = txType === 'transfer' || txType === 'withdrawal'

  const [accountId,   setAccountId]   = useState('')
  const [conceptId,   setConceptId]   = useState('')
  const [conceptSearch, setConceptSearch] = useState('')
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

  const { data: accounts    = [], isSuccess: accountsLoaded } = useQuery({ queryKey: ['accounts'],    queryFn: fetchAccounts,    enabled: open, select: withoutArchived })
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

  const srcAccount   = accounts.find(a => a.id === accountId)
  // Una sola Transferencia: cualquier cuenta puede ser destino. Según el tipo de cuenta se ve si es
  // un retiro (banco/billetera → efectivo) o una carga (efectivo → banco/billetera)
  const destOptions  = accounts.filter(a => a.id !== accountId)
  const destAccount  = accounts.find(a => a.id === destAccountId)
  const moveKind     = !isMove || !srcAccount || !destAccount ? null
    : srcAccount.type !== 'cash' && destAccount.type === 'cash' ? 'Retiro'
    : srcAccount.type === 'cash' && destAccount.type !== 'cash' ? 'Carga' : null
  const crossCurrency = isMove && !!srcAccount && !!destAccount && srcAccount.currency !== destAccount.currency
  const crossRate    = crossCurrency ? findRate(rates, srcAccount!.currency, destAccount!.currency, date) : null
  const estDestAmount = crossRate !== null && parseFloat(amount) > 0 ? (parseFloat(amount) * crossRate).toFixed(2) : null

  // Concepto → categoría: solo se elige el concepto; la categoría se completa sola.
  // Los conceptos se filtran por el tipo de movimiento (sin "Supermercado" en un ingreso).
  const kindForType: CategoryKind = isMove ? 'transfer' : txType
  const typeConcepts = conceptsForType(concepts, categories, txType)
  const selectedConcept = concepts.find(c => c.id === conceptId)
  const selectedCategory = selectedConcept ? categories.find(c => c.id === selectedConcept.category_id) : undefined
  // Al editar un movimiento viejo cuyo concepto no corresponde al tipo, se sigue mostrando
  const visibleConcepts = selectedConcept && !typeConcepts.some(c => c.id === selectedConcept.id)
    ? [selectedConcept, ...typeConcepts] : typeConcepts
  const typeCategories = categories.filter(c => c.kind === kindForType || c.kind === 'any')
  const search = conceptSearch.trim().toLowerCase()
  const conceptGroups = categories
    .map(cat => ({
      cat,
      items: visibleConcepts
        .filter(c => c.category_id === cat.id)
        .filter(c => !search || c.name.toLowerCase().includes(search) || cat.name.toLowerCase().includes(search)),
    }))
    .filter(g => g.items.length > 0)
    // Primero las categorías propias del tipo (ej: Sueldo en un ingreso), después las de "Todos";
    // dentro de cada grupo, las que tienen conceptos más usados
    .sort((a, b) =>
      Number(b.cat.kind === kindForType) - Number(a.cat.kind === kindForType)
      || Math.max(...b.items.map(c => c.frequency_score)) - Math.max(...a.items.map(c => c.frequency_score)))

  // Si cambia el tipo y el concepto elegido ya no sirve, se limpia (solo al crear)
  useEffect(() => {
    if (!isEditing && conceptId && concepts.length > 0 && !typeConcepts.some(c => c.id === conceptId)) setConceptId('')
  }, [txType, concepts, categories])

  useEffect(() => {
    if (!open) {
      setTxType('expense')
      setAccountId(''); setConceptId(''); setConceptSearch('')
      setAmount(''); setDate(today()); setDescription('')
      setDestAccountId(''); setServerError(null)
      setShowNewConcept(false)
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
    // Concepto obligatorio (en transferencias y retiros, si no se elige, se usa "Transferencia")
    if (!conceptId && !isMove) { setServerError('Elegí un concepto'); return }
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { setServerError('El monto debe ser mayor a 0'); return }
    if (!date) { setServerError('La fecha es requerida'); return }
    if (!isEditing) {
      if (!accountId) { setServerError('Seleccioná una cuenta'); return }
      if (isMove && !destAccountId) {
        setServerError('Seleccioná la cuenta destino'); return
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
          ...(txType === 'expense' ? { metodo_pago: metodoPago, household_ids: selectedHouseholdIds } : {}),
        })
        queryClient.removeQueries({ queryKey: ['tx', editTxId] })
      } else if (enCuotas && txType === 'expense') {
        await createInstalmentPlan({
          account_id:   accountId,
          concept_id:   conceptId,
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

  // Solo después de cargar: si no, el aviso de "no tenés cuentas" aparece un instante y desaparece
  const noAccounts = accountsLoaded && accounts.length === 0

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="sheet bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl max-h-[92dvh] sm:max-h-[90dvh] overflow-y-auto [scrollbar-width:thin] [scrollbar-color:theme(colors.slate.700)_transparent]">

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
          {(['income', 'expense', 'transfer'] as const).map(type => {
            const labels = { income: 'Ingreso', expense: 'Gasto', transfer: 'Transferencia' }
            const activeStyles = {
              income:     'bg-cyan-400/15 border-cyan-400/40 text-cyan-400',
              expense:    'bg-rose-400/15 border-rose-400/40 text-rose-400',
              transfer:   'bg-amber-400/15 border-amber-400/40 text-amber-400',
            }
            const isActive = txType === type || (type === 'transfer' && isMove)
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
              <label className={labelClass}>{isMove ? 'Cuenta origen' : 'Cuenta'} {isEditing && <span className="text-slate-600">(no editable)</span>}</label>
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
                          if (isMove) setDestAccountId('')
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
                <label className={labelClass}>
                  Cuenta destino
                  {moveKind && (
                    <span className="ml-2 px-1.5 py-px rounded text-[10px] font-semibold bg-lime-500/15 text-lime-400 border border-lime-500/20">
                      {moveKind === 'Retiro' ? 'RETIRO de efectivo' : 'CARGA de efectivo'}
                    </span>
                  )}
                </label>
                <div className="relative">
                  <button
                    onClick={() => setOpenDd(openDd === 'destAccount' ? null : 'destAccount')}
                    onBlur={closeDd}
                    className={`${ddBtn} ${destAccountId ? 'text-slate-200' : 'text-slate-500'}`}
                  >
                    <span className="truncate">
                      {destAccountId
                        ? (() => { const a = accounts.find(a => a.id === destAccountId); return a ? `${a.name} · ${a.currency} · ${Number(a.balance).toLocaleString()}` : '—' })()
                        : 'Seleccioná una cuenta'}
                    </span>
                    <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 ml-2" />
                  </button>
                  {openDd === 'destAccount' && (
                    <div className={ddPanel}>
                      {destOptions.length === 0 && (
                        <p className="px-4 py-2 text-xs text-slate-500">
                          No hay otra cuenta. Creá una (ej: Efectivo USD) en Configuración → Cuentas.
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
                  : 'Si la cuenta destino es en otra moneda (ej: sacás dólares desde una cuenta en pesos), te vamos a pedir cuánto llegó.'}
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

            {/* Comisión — transferencias, retiros y cargas */}
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

            {/* Concepto (obligatorio) → la categoría se completa sola */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelClass + ' mb-0'}>
                  Concepto {isMove && <span className="text-slate-600">(opcional)</span>}
                </label>
                <button
                  onClick={() => setShowNewConcept(v => !v)}
                  className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Nuevo
                </button>
              </div>
              <div className="relative">
                <button
                  onClick={() => { setOpenDd(openDd === 'concept' ? null : 'concept'); setConceptSearch('') }}
                  className={`${ddBtn} ${conceptId ? 'text-slate-200' : 'text-slate-500'}`}
                >
                  <span className="truncate">
                    {selectedConcept ? selectedConcept.name : isMove ? 'Transferencia' : 'Elegí un concepto'}
                  </span>
                  <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 ml-2" />
                </button>
                {openDd === 'concept' && (
                  <div className={ddPanel + ' max-h-72'}>
                    <div className="px-2 pb-1 pt-0.5 sticky top-0 bg-slate-900">
                      <input
                        autoFocus
                        type="text"
                        value={conceptSearch}
                        onChange={e => setConceptSearch(e.target.value)}
                        onBlur={closeDd}
                        onKeyDown={e => { if (e.key === 'Escape') setOpenDd(null) }}
                        placeholder="Buscar concepto…"
                        className="w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-emerald-500/60"
                      />
                    </div>
                    {conceptGroups.length === 0 && (
                      <p className="px-4 py-3 text-xs text-slate-500">
                        {search ? 'Ningún concepto coincide.' : 'No hay conceptos para este tipo de movimiento.'} Creá uno con “Nuevo”.
                      </p>
                    )}
                    {conceptGroups.map(({ cat, items }) => (
                      <div key={cat.id}>
                        <p className="px-4 pt-2 pb-0.5 text-[10px] uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full shrink-0" style={{ background: cat.color ?? '#64748b' }} />
                          {cat.name}
                        </p>
                        {items.map(c => (
                          <button key={c.id} onMouseDown={e => e.preventDefault()} onClick={() => { setConceptId(c.id); setOpenDd(null) }}
                            className={`w-full text-left pl-7 pr-4 py-1.5 text-sm transition-colors hover:bg-slate-800 flex items-center justify-between ${conceptId === c.id ? 'text-slate-200 font-semibold' : 'text-slate-400'}`}>
                            <span className="truncate">{c.name}</span>
                            {conceptId === c.id && <span className="text-emerald-400 text-[10px] shrink-0 ml-2">✓</span>}
                          </button>
                        ))}
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {selectedCategory && (
                <p className="mt-1.5 text-[11px] text-slate-500 flex items-center gap-1.5">
                  Categoría:
                  <span className="inline-flex items-center gap-1 text-slate-300">
                    <span className="w-2 h-2 rounded-full" style={{ background: selectedCategory.color ?? '#64748b' }} />
                    {selectedCategory.name}
                  </span>
                  {selectedConcept?.is_refund && <span className="text-emerald-400">· reintegro, resta del gasto</span>}
                </p>
              )}
              {showNewConcept && (
                <QuickCreateConcept
                  categories={typeCategories}
                  defaultKind={kindForType}
                  onCreated={id => { setConceptId(id); setShowNewConcept(false) }}
                  onCancel={() => setShowNewConcept(false)}
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
                  {isMove ? 'Monto a transferir' : 'Monto'}
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
