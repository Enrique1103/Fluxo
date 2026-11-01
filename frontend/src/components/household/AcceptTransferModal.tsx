import { useState } from 'react'
import { X, Loader2, ChevronDown } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchAccounts, withoutArchived } from '../../api/dashboard'
import { acceptPendingMemberTransfer, PendingMemberTransfer } from '../../api/households'
import { invalidateFinancialData } from '../../lib/queryClient'

interface Props {
  pending: PendingMemberTransfer | null
  householdId: string
  onClose: () => void
}

const fmt = (n: number, currency: string) =>
  `${currency} ${n.toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`

function parseErr(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  if (!e?.response) return 'Sin conexión con el servidor'
  const detail = e.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map(x => (x as { msg?: string })?.msg ?? String(x)).join('. ')
  return fallback
}

export default function AcceptTransferModal({ pending, householdId, onClose }: Props) {
  const qc = useQueryClient()
  const [toAcctId, setToAcctId] = useState('')
  const [dd, setDd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const { data: myAccounts = [] } = useQuery({
    queryKey: ['accounts'], queryFn: fetchAccounts, enabled: !!pending, select: withoutArchived,
  })

  const selectedAcct = myAccounts.find(a => a.id === toAcctId)

  const handleAccept = async () => {
    if (!pending) return
    if (!toAcctId) { setError('Elegí en qué cuenta recibís el dinero'); return }
    setSaving(true); setError(null)
    try {
      await acceptPendingMemberTransfer(householdId, pending.id, toAcctId)
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['household-analytics', householdId] }),
        qc.invalidateQueries({ queryKey: ['pending-transfers', householdId] }),
        invalidateFinancialData(qc),
      ])
      onClose()
    } catch (err) {
      setError(parseErr(err, 'No se pudo aceptar la transferencia'))
    } finally {
      setSaving(false)
    }
  }

  if (!pending) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="sheet bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">Aceptar transferencia</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Transfer info */}
        <div className="bg-slate-800/60 rounded-2xl p-4 mb-4 space-y-1.5">
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">De</span>
            <span className="text-slate-200 font-medium">{pending.from_user_name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Monto</span>
            <span className="text-emerald-400 font-bold">{fmt(pending.amount, pending.currency)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-slate-400">Fecha</span>
            <span className="text-slate-200">{pending.date}</span>
          </div>
          {pending.description && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-400">Descripción</span>
              <span className="text-slate-300 text-right max-w-[60%]">{pending.description}</span>
            </div>
          )}
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">¿A qué cuenta tuya entra el dinero?</label>
            <div className="relative">
              <button
                onClick={() => setDd(v => !v)}
                className="w-full flex items-center justify-between bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-left text-slate-200"
              >
                <span className="truncate">
                  {selectedAcct
                    ? `${selectedAcct.name} · ${selectedAcct.currency} · ${selectedAcct.balance.toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`
                    : 'Elegí una cuenta'}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 ml-2" />
              </button>
              {dd && (
                <div className="absolute top-full left-0 mt-1 z-[200] w-full bg-slate-900 border border-slate-700 rounded-xl shadow-xl py-1 max-h-52 overflow-y-auto">
                  {myAccounts.map(a => (
                    <button key={a.id} onClick={() => { setToAcctId(a.id); setDd(false) }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-800 ${a.id === toAcctId ? 'text-slate-200 font-semibold' : 'text-slate-400'}`}>
                      {a.name} · {a.currency} · {a.balance.toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {error && <p className="text-rose-400 text-xs">{error}</p>}

          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-semibold"
            >
              Cancelar
            </button>
            <button
              onClick={handleAccept} disabled={saving}
              className="flex-1 py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 text-slate-950 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
            >
              {saving && <Loader2 className="w-4 h-4 animate-spin" />}
              Aceptar
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
