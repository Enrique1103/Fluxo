import { useEffect, useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import DatePicker from './DatePicker'
import { updateTransfer } from '../api/dashboard'
import { invalidateFinancialData } from '../lib/queryClient'

interface TransferInfo {
  id: string
  amount: number
  date: string
  description: string | null
  account_name: string
  transfer_dest_name: string | null
}

interface Props {
  transfer: TransferInfo | null
  onClose: () => void
}

function parseErr(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  if (!e?.response) return 'Sin conexión con el servidor'
  const detail = e.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map(x => (x as { msg?: string })?.msg ?? String(x)).join('. ')
  return fallback
}

export default function EditTransferModal({ transfer, onClose }: Props) {
  const qc = useQueryClient()

  const [amount,      setAmount]      = useState('')
  const [date,        setDate]        = useState('')
  const [description, setDescription] = useState('')
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState<string | null>(null)

  useEffect(() => {
    if (transfer) {
      setAmount(String(transfer.amount))
      setDate(transfer.date)
      setDescription(transfer.description ?? '')
      setError(null)
    }
  }, [transfer])

  if (!transfer) return null

  const handleSave = async () => {
    const amt = parseFloat(amount)
    if (!amount || isNaN(amt) || amt <= 0) { setError('El monto debe ser mayor a 0'); return }
    if (!date) { setError('Elegí la fecha'); return }
    setSaving(true); setError(null)
    try {
      await updateTransfer(transfer.id, {
        amount: amt,
        date,
        description: description.trim() || null,
      })
      await invalidateFinancialData(qc)
      onClose()
    } catch (err) {
      setError(parseErr(err, 'No se pudo editar la transferencia'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="sheet bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">Editar transferencia</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {transfer.transfer_dest_name && (
          <p className="text-xs text-slate-500 mb-4">
            {transfer.account_name} → {transfer.transfer_dest_name}
          </p>
        )}

        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Monto</label>
            <input
              type="number" min="0.01" step="0.01" value={amount}
              onChange={e => setAmount(e.target.value)}
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500/60"
            />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Fecha</label>
            <DatePicker value={date} onChange={setDate} />
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">
              Descripción <span className="text-slate-600">(opcional)</span>
            </label>
            <input
              type="text" value={description} maxLength={100}
              onChange={e => setDescription(e.target.value)}
              placeholder="Ej: Pago de alquiler"
              className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500/60 w-full"
            />
          </div>

          {error && <p className="text-rose-400 text-xs">{error}</p>}

          <button
            onClick={handleSave} disabled={saving}
            className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 text-slate-950 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar cambios
          </button>
        </div>
      </div>
    </div>
  )
}
