import { useState } from 'react'
import { X, Loader2, ChevronDown } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { createAccount } from '../api/dashboard'
import { invalidateFinancialData } from '../lib/queryClient'
import { useHomeCurrency } from '../hooks/useHomeCurrency'

interface Props {
  open: boolean
  onClose: () => void
}

const inputClass =
  'bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500/60 transition-colors w-full'
const selectClass =
  'bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500/60 transition-colors w-full appearance-none cursor-pointer'
const labelClass = 'text-xs text-slate-400 mb-1 block'

function parseErr(err: unknown, fallback: string): string {
  const e = err as any
  if (!e?.response) return 'Sin conexión con el servidor — verificá que el backend esté activo'
  const detail = e.response?.data?.detail
  if (!detail) return fallback
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail))
    return detail.map((x: unknown) => (x as { msg?: string })?.msg ?? String(x)).join('. ')
  return fallback
}

export default function AccountModal({ open, onClose }: Props) {
  const queryClient  = useQueryClient()
  const homeCurrency = useHomeCurrency()
  const currencyOpts = [...new Set([homeCurrency, 'USD', 'EUR'])]

  const [name,        setName]        = useState('')
  const [type,        setType]        = useState('cash')
  const [currency,    setCurrency]    = useState(homeCurrency)
  const [balance,     setBalance]     = useState('')
  const [creditLimit, setCreditLimit] = useState('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  const reset = () => {
    setName(''); setType('cash'); setCurrency(homeCurrency)
    setBalance(''); setCreditLimit(''); setError(null)
  }

  const handleClose = () => { reset(); onClose() }

  const handleSubmit = async () => {
    if (!name.trim()) { setError('El nombre es requerido'); return }
    const bal = balance === '' ? 0 : parseFloat(balance)
    if (isNaN(bal) || bal < 0) { setError('El saldo inicial debe ser un número ≥ 0'); return }
    if (type === 'credit') {
      const lim = parseFloat(creditLimit)
      if (isNaN(lim) || lim <= 0) { setError('El límite de crédito debe ser mayor a 0'); return }
    }
    setSaving(true); setError(null)
    try {
      const payload: Parameters<typeof createAccount>[0] = {
        name: name.trim(), type, currency, balance: bal,
      }
      if (type === 'credit') payload.credit_limit = parseFloat(creditLimit)
      await createAccount(payload)
      await invalidateFinancialData(queryClient)
      reset()
      onClose()
    } catch (err) {
      setError(parseErr(err, 'No se pudo crear la cuenta'))
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Nueva Cuenta</h2>
          <button
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">

          {/* Nombre */}
          <div>
            <label className={labelClass}>Nombre</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej: Efectivo, Santander, Fondo AFAP..."
              className={inputClass}
            />
          </div>

          {/* Tipo + Moneda */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelClass}>Tipo</label>
              <div className="relative">
                <select value={type} onChange={e => setType(e.target.value)} className={selectClass}>
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
                <select value={currency} onChange={e => setCurrency(e.target.value)} className={selectClass}>
                  {currencyOpts.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Saldo inicial — oculto para cuentas de crédito (siempre inician en 0) */}
          {type !== 'credit' && (
            <div>
              <label className={labelClass}>Saldo inicial</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={balance}
                onChange={e => setBalance(e.target.value)}
                placeholder="0.00"
                className={inputClass}
              />
            </div>
          )}

          {/* Límite de crédito — solo para cuentas credit */}
          {type === 'credit' && (
            <div>
              <label className={labelClass}>Límite de crédito</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={creditLimit}
                onChange={e => setCreditLimit(e.target.value)}
                placeholder="0.00"
                className={inputClass}
              />
            </div>
          )}

          {error && <p className="text-rose-400 text-xs">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 mt-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Crear Cuenta
          </button>

        </div>
      </div>
    </div>
  )
}
