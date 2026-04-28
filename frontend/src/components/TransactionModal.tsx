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
  type Account,
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
const selectClass =
  'bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500/60 transition-colors w-full appearance-none cursor-pointer'
const labelClass = 'text-xs text-slate-400 mb-1 block'

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

// ─── Main component ──────────────────────────────────────────────────────────

export default function TransactionModal({ open, onClose, editTxId }: Props) {
  const isEditing    = !!editTxId
  const queryClient  = useQueryClient()
  const homeCurrency = useHomeCurrency()
  const currencyOpts = [...new Set([homeCurrency, 'USD', 'EUR'])]

  const [txType, setTxType] = useState<'income' | 'expense' | 'transfer'>('expense')

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

  // Cuotas
  const [enCuotas,  setEnCuotas]  = useState(false)
  const [nCuotas,   setNCuotas]   = useState('2')

  // Household
  const [isShared,     setIsShared]     = useState(false)
  const [householdId,  setHouseholdId]  = useState('')

  // Quick-create panels
  const [showNewConcept,  setShowNewConcept]  = useState(false)
  const [showNewCategory, setShowNewCategory] = useState(false)

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
  const { data: editTx      }      = useQuery({ queryKey: ['tx', editTxId], queryFn: () => fetchTransaction(editTxId!), enabled: !!editTxId && open })

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
    setIsShared(!!editTx.household_id)
  }, [editTx])

  useEffect(() => {
    if (!open) return
    if (editTx?.household_id) {
      setHouseholdId(editTx.household_id)
    } else if (households.length > 0 && !isEditing) {
      setHouseholdId(households[0].id)
    } else if (households.length > 0 && !householdId) {
      setHouseholdId(households[0].id)
    }
  }, [open, households, editTx])

  useEffect(() => { setDestAccountId('') }, [accountId])

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
      setEnCuotas(false); setNCuotas('2')
      setIsShared(false); setHouseholdId('')
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
    if (!conceptId)  { setServerError('Seleccioná un concepto');   return }
    if (!categoryId) { setServerError('Seleccioná una categoría'); return }
    const amt = parseFloat(amount)
    if (isNaN(amt) || amt <= 0) { setServerError('El monto debe ser mayor a 0'); return }
    if (!date) { setServerError('La fecha es requerida'); return }
    if (!isEditing) {
      if (!accountId) { setServerError('Seleccioná una cuenta'); return }
      if (txType === 'transfer' && !destAccountId) { setServerError('Seleccioná la cuenta destino'); return }
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
          concept_id:   conceptId,
          category_id:  categoryId,
          ...(txType === 'expense' ? { metodo_pago: metodoPago } : {}),
          household_id: isShared && householdId && txType === 'expense' ? householdId : null,
        })
      } else if (enCuotas && txType === 'expense') {
        await createInstalmentPlan({
          account_id:   accountId,
          concept_id:   conceptId,
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
          concept_id:  conceptId,
          category_id: categoryId,
          amount:      amt,
          type:        txType,
          date,
          description: description.trim() || undefined,
          ...(txType === 'transfer' && destAccountId
            ? { transfer_to_account_id: destAccountId }
            : {}),
          ...(txType === 'expense' ? { metodo_pago: metodoPago } : {}),
          ...(isShared && householdId && txType === 'expense'
            ? { household_id: householdId }
            : {}),
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
          {(['income', 'expense', 'transfer'] as const).map(type => {
            const labels = { income: 'Ingreso', expense: 'Gasto', transfer: 'Transferencia' }
            const activeStyles = {
              income:   'bg-cyan-400/15 border-cyan-400/40 text-cyan-400',
              expense:  'bg-rose-400/15 border-rose-400/40 text-rose-400',
              transfer: 'bg-amber-400/15 border-amber-400/40 text-amber-400',
            }
            const isActive = txType === type
            return (
              <button
                key={type}
                disabled={isEditing}
                onClick={() => { if (!isEditing) { setTxType(type); if (type !== 'expense') { setIsShared(false); setHouseholdId('') } } }}
                className={`flex-1 py-2 rounded-xl text-sm font-semibold border transition-all ${
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
                    <select value={acctType} onChange={e => setAcctType(e.target.value)} className={selectClass}>
                      <option value="cash">Efectivo</option>
                      <option value="debit">Débito</option>
                      <option value="credit">Crédito</option>
                      <option value="investment">Inversión</option>
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  </div>
                </div>
                <div>
                  <label className={labelClass}>Moneda</label>
                  <div className="relative">
                    <select value={acctCurrency} onChange={e => setAcctCurrency(e.target.value)} className={selectClass}>
                      {currencyOpts.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
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
                <select
                  value={accountId}
                  disabled={isEditing}
                  onChange={e => {
                    const id = e.target.value
                    setAccountId(id)
                    const acc = accounts.find(a => a.id === id)
                    if (acc && txType === 'expense') {
                      if (acc.type === 'cash')   { setMetodoPago('efectivo');       setEnCuotas(false) }
                      if (acc.type === 'debit')  { setMetodoPago('tarjeta_debito'); setEnCuotas(false) }
                      if (acc.type === 'credit') { setMetodoPago('tarjeta_credito') }
                    }
                  }}
                  className={selectClass + (isEditing ? ' opacity-50 cursor-default' : '')}
                >
                  <option value="" disabled>Seleccioná una cuenta</option>
                  {accounts.map(acc => (
                    <option key={acc.id} value={acc.id}>
                      {acc.name} · {acc.currency} · {acc.balance.toLocaleString()}
                    </option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              </div>
            </div>

            {/* Cuenta destino — solo para transferencias */}
            {txType === 'transfer' && (
              <div>
                <label className={labelClass}>Cuenta destino</label>
                <div className="relative">
                  <select
                    value={destAccountId}
                    onChange={e => setDestAccountId(e.target.value)}
                    className={selectClass}
                  >
                    <option value="" disabled>Seleccioná una cuenta</option>
                    {accounts
                      .filter(a => a.id !== accountId)
                      .map(a => (
                        <option key={a.id} value={a.id}>
                          {a.name} · {a.currency} · {Number(a.balance).toLocaleString()}
                        </option>
                      ))}
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                </div>
              </div>
            )}

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
                <select
                  value={categoryId}
                  onChange={e => setCategoryId(e.target.value)}
                  className={`${selectClass} ${categoryId ? 'text-slate-200' : 'text-slate-500'}`}
                >
                  <option value="" disabled>Seleccioná una categoría</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
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
                  <select
                    value={metodoPago}
                    onChange={e => {
                      const v = e.target.value as PaymentMethod
                      setMetodoPago(v)
                      if (v !== 'tarjeta_credito') setEnCuotas(false)
                    }}
                    className={selectClass}
                  >
                    <option value="efectivo">Efectivo</option>
                    <option value="tarjeta_credito">Tarjeta de crédito</option>
                    <option value="tarjeta_debito">Tarjeta de débito</option>
                    <option value="transferencia_bancaria">Transferencia bancaria</option>
                    <option value="billetera_digital">Billetera digital</option>
                    <option value="otro">Otro</option>
                  </select>
                  <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
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

            {/* Concepto */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className={labelClass + ' mb-0'}>Concepto</label>
                <button
                  onClick={() => { setShowNewConcept(v => !v); setShowNewCategory(false) }}
                  className="flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors"
                >
                  <Plus className="w-3 h-3" /> Nuevo
                </button>
              </div>
              <div className="relative">
                <select value={conceptId} onChange={e => setConceptId(e.target.value)} className={selectClass}>
                  <option value="" disabled>Seleccioná un concepto</option>
                  {concepts.map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              </div>
              {showNewConcept && (
                <QuickCreateConcept
                  onCreated={id => { setConceptId(id); setShowNewConcept(false) }}
                  onCancel={() => setShowNewConcept(false)}
                />
              )}
            </div>

            {/* Monto */}
            <div>
              <label className={labelClass}>Monto</label>
              <input type="number" min="0.01" step="0.01" value={amount}
                onChange={e => setAmount(e.target.value)} placeholder="0.00" className={inputClass} />
            </div>

            {/* Fecha */}
            <div>
              <label className={labelClass}>Fecha</label>
              <DatePicker value={date} onChange={setDate} />
            </div>

            {/* Hogar toggle — solo para gastos */}
            {txType === 'expense' && (
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => households.length > 0 && setIsShared(v => !v)}
                  title={households.length === 0 ? 'Primero creá un hogar' : isShared ? 'Quitar del hogar' : 'Marcar como gasto del hogar'}
                  className={`flex items-center gap-2 px-3 py-2 rounded-xl border transition-all ${
                    households.length === 0
                      ? 'bg-slate-800/40 border-slate-800 text-slate-600 cursor-not-allowed'
                      : isShared
                        ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400'
                        : 'bg-slate-800 border-slate-700 text-slate-500 hover:text-slate-300'
                  }`}
                >
                  <Home className="w-4 h-4 shrink-0" />
                  <span className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${isShared && households.length > 0 ? 'bg-indigo-500' : 'bg-slate-600'}`}>
                    <span className={`inline-block h-3 w-3 transform rounded-full bg-white shadow transition-transform ${isShared && households.length > 0 ? 'translate-x-3.5' : 'translate-x-0.5'}`} />
                  </span>
                </button>
                {isShared && households.length > 1 && (
                  <div className="relative flex-1">
                    <select
                      value={householdId}
                      onChange={e => setHouseholdId(e.target.value)}
                      className={selectClass}
                    >
                      {households.map(h => (
                        <option key={h.id} value={h.id}>{h.name}</option>
                      ))}
                    </select>
                    <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                  </div>
                )}
                {isShared && households.length === 1 && (
                  <span className="text-xs text-indigo-400">{households[0].name}</span>
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
