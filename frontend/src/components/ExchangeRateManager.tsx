import { useState, useEffect } from 'react'
import { TrendingUp, Plus, Pencil, Trash2, X, Check, AlertTriangle } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import {
  fetchExchangeRates,
  createExchangeRate,
  updateExchangeRate,
  deleteExchangeRate,
  type ExchangeRate,
} from '../api/dashboard'
import { invalidateFinancialData } from '../lib/queryClient'

const MONTH_NAMES: Record<string, string> = {
  '01': 'Enero', '02': 'Febrero', '03': 'Marzo', '04': 'Abril',
  '05': 'Mayo', '06': 'Junio', '07': 'Julio', '08': 'Agosto',
  '09': 'Septiembre', '10': 'Octubre', '11': 'Noviembre', '12': 'Diciembre',
}

function fmtMonth(year: number, month: number) {
  const m = String(month).padStart(2, '0')
  return `${MONTH_NAMES[m] ?? m} ${year}`
}

interface AddFormState {
  from_currency: string
  to_currency: string
  rate: string
  year: number
  month: number
}

const today = new Date()

export default function ExchangeRateManager({ userCurrency }: { userCurrency: string }) {
  const queryClient = useQueryClient()
  const [rates, setRates]       = useState<ExchangeRate[]>([])
  const [loading, setLoading]   = useState(true)
  const [editId, setEditId]     = useState<string | null>(null)
  const [editVal, setEditVal]   = useState('')
  const [showAdd, setShowAdd]   = useState(false)
  const [saving, setSaving]     = useState(false)
  const [error, setError]       = useState<string | null>(null)

  const [form, setForm] = useState<AddFormState>({
    from_currency: 'USD',
    to_currency: userCurrency !== 'USD' ? userCurrency : 'UYU',
    rate: '',
    year: today.getFullYear(),
    month: today.getMonth() + 1,
  })

  const load = async () => {
    try {
      setRates(await fetchExchangeRates())
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  const handleAdd = async () => {
    if (!form.rate || isNaN(Number(form.rate)) || Number(form.rate) <= 0) {
      setError('La tasa debe ser un número mayor a 0')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await createExchangeRate({
        from_currency: form.from_currency,
        to_currency: form.to_currency,
        rate: Number(form.rate),
        year: form.year,
        month: form.month,
      })
      setShowAdd(false)
      setForm(f => ({ ...f, rate: '' }))
      await load()
      invalidateFinancialData(queryClient)
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Error al guardar')
    } finally {
      setSaving(false)
    }
  }

  const handleEdit = async (id: string) => {
    if (!editVal || isNaN(Number(editVal)) || Number(editVal) <= 0) {
      setError('La tasa debe ser un número mayor a 0')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updateExchangeRate(id, Number(editVal))
      setEditId(null)
      await load()
      invalidateFinancialData(queryClient)
    } catch (e: any) {
      setError(e?.response?.data?.detail ?? 'Error al actualizar')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setSaving(true)
    try {
      await deleteExchangeRate(id)
      await load()
      invalidateFinancialData(queryClient)
    } finally {
      setSaving(false)
    }
  }

  if (loading) return (
    <div className="flex items-center justify-center py-8">
      <div className="w-5 h-5 border-2 border-emerald-500/30 border-t-emerald-500 rounded-full animate-spin" />
    </div>
  )

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-emerald-400" />
          <span className="text-sm font-semibold text-slate-200">Tasas de cambio</span>
        </div>
        <button
          onClick={() => { setShowAdd(s => !s); setError(null) }}
          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-emerald-500/15 text-emerald-400 hover:bg-emerald-500/25 transition-colors"
        >
          <Plus className="w-3 h-3" />
          Agregar
        </button>
      </div>

      {/* Add form */}
      {showAdd && (
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">De</label>
              <input
                value={form.from_currency}
                onChange={e => setForm(f => ({ ...f, from_currency: e.target.value.toUpperCase() }))}
                maxLength={10}
                placeholder="USD"
                className="w-full bg-slate-700/60 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">A</label>
              <input
                value={form.to_currency}
                onChange={e => setForm(f => ({ ...f, to_currency: e.target.value.toUpperCase() }))}
                maxLength={10}
                placeholder={userCurrency}
                className="w-full bg-slate-700/60 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Año</label>
              <input
                type="number"
                value={form.year}
                onChange={e => setForm(f => ({ ...f, year: Number(e.target.value) }))}
                className="w-full bg-slate-700/60 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/60"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Mes</label>
              <select
                value={form.month}
                onChange={e => setForm(f => ({ ...f, month: Number(e.target.value) }))}
                className="w-full bg-slate-700/60 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-emerald-500/60"
              >
                {Object.entries(MONTH_NAMES).map(([num, name]) => (
                  <option key={num} value={Number(num)}>{name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Tasa</label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={form.rate}
                onChange={e => setForm(f => ({ ...f, rate: e.target.value }))}
                placeholder="43.50"
                className="w-full bg-slate-700/60 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-emerald-500/60"
              />
            </div>
          </div>
          <p className="text-[11px] text-slate-500 leading-relaxed">
            Indica cuántos <span className="text-slate-400 font-medium">{form.to_currency}</span> vale 1 <span className="text-slate-400 font-medium">{form.from_currency}</span>. Ej: si 1 USD = 40 UYU, ingresás <span className="text-slate-400 font-medium">40</span>. Usá el promedio entre compra y venta del mes.
          </p>

          {error && (
            <p className="text-xs text-red-400 flex items-center gap-1.5">
              <AlertTriangle className="w-3 h-3 shrink-0" />{error}
            </p>
          )}

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => { setShowAdd(false); setError(null) }}
              className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleAdd}
              disabled={saving}
              className="px-3 py-1.5 text-xs font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
      )}

      {/* Rate list */}
      {rates.length === 0 && !showAdd ? (
        <p className="text-xs text-slate-500 text-center py-4">
          No hay tasas registradas aún.
        </p>
      ) : (
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1 [scrollbar-width:thin] [scrollbar-color:theme(colors.slate.700)_transparent]">
          {rates.map(r => (
            <div
              key={r.id}
              className="flex items-center gap-3 bg-slate-800/40 border border-slate-700/30 rounded-xl px-3 py-2.5"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-semibold text-slate-200">
                    {r.from_currency} → {r.to_currency}
                  </span>
                  <span className="text-xs text-slate-500">{fmtMonth(r.year, r.month)}</span>
                </div>
                {editId === r.id ? (
                  <div className="flex items-center gap-2 mt-1.5">
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      value={editVal}
                      onChange={e => setEditVal(e.target.value)}
                      autoFocus
                      className="w-24 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-xs text-white focus:outline-none focus:border-emerald-500/60"
                    />
                    <button onClick={() => handleEdit(r.id)} disabled={saving}
                      className="text-emerald-400 hover:text-emerald-300 transition-colors">
                      <Check className="w-3.5 h-3.5" />
                    </button>
                    <button onClick={() => { setEditId(null); setError(null) }}
                      className="text-slate-500 hover:text-slate-300 transition-colors">
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <span className="text-sm font-bold text-emerald-400">{r.rate.toLocaleString('es-UY', { minimumFractionDigits: 2 })}</span>
                )}
              </div>
              {editId !== r.id && (
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    onClick={() => { setEditId(r.id); setEditVal(String(r.rate)); setError(null) }}
                    className="p-1 text-slate-500 hover:text-slate-300 transition-colors"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  <button
                    onClick={() => handleDelete(r.id)}
                    disabled={saving}
                    className="p-1 text-slate-500 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
