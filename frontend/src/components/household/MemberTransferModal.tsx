import { useEffect, useState } from 'react'
import { X, Loader2, ChevronDown } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import DatePicker from '../DatePicker'
import { fetchAccounts, withoutArchived } from '../../api/dashboard'
import { createPendingMemberTransfer } from '../../api/households'
import { invalidateFinancialData } from '../../lib/queryClient'

interface Member {
  user_id: string
  user_name: string
}

interface Props {
  open: boolean
  onClose: () => void
  householdId: string
  currentUserId: string
  activeMembers: Member[]
  defaultCurrency: string
}

const fmt = (n: number) => n.toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 2 })
const today = () => new Date().toLocaleDateString('en-CA')

function parseErr(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { detail?: unknown } } }
  if (!e?.response) return 'Sin conexión con el servidor'
  const detail = e.response?.data?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map(x => (x as { msg?: string })?.msg ?? String(x)).join('. ')
  return fallback
}

export default function MemberTransferModal({
  open, onClose, householdId, currentUserId, activeMembers, defaultCurrency,
}: Props) {
  const qc = useQueryClient()
  const others = activeMembers.filter(m => m.user_id !== currentUserId)

  const [toUserId, setToUserId]       = useState(others[0]?.user_id ?? '')
  const [fromAcctId, setFromAcctId]   = useState('')
  const [amount, setAmount]           = useState('')
  const [currency, setCurrency]       = useState(defaultCurrency)
  const [date, setDate]               = useState(today())
  const [description, setDescription] = useState('')
  const [saving, setSaving]           = useState(false)
  const [error, setError]             = useState<string | null>(null)
  const [fromDd, setFromDd]           = useState(false)
  const [recipientDd, setRecipientDd] = useState(false)

  const { data: myAccounts = [] } = useQuery({
    queryKey: ['accounts'], queryFn: fetchAccounts, enabled: open, select: withoutArchived,
  })

  useEffect(() => {
    if (open) {
      setToUserId(others[0]?.user_id ?? '')
      setFromAcctId(''); setAmount(''); setDate(today())
      setDescription(''); setError(null); setFromDd(false)
      setCurrency(defaultCurrency)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (open && !fromAcctId && myAccounts.length > 0) {
      const match = myAccounts.find(a => a.currency === currency) ?? myAccounts[0]
      setFromAcctId(match.id)
    }
  }, [open, myAccounts, fromAcctId, currency])

  const selectedFrom  = myAccounts.find(a => a.id === fromAcctId)
  const recipientName = others.find(m => m.user_id === toUserId)?.user_name ?? ''

  const handleSave = async () => {
    if (!toUserId)   { setError('Elegí a quién le transferís'); return }
    if (!fromAcctId) { setError('Elegí de qué cuenta sale'); return }
    const amt = parseFloat(amount)
    if (!amount || isNaN(amt) || amt <= 0) { setError('El monto debe ser mayor a 0'); return }
    if (!date) { setError('Elegí la fecha'); return }
    setSaving(true); setError(null)
    try {
      await createPendingMemberTransfer(householdId, {
        to_user_id: toUserId,
        from_account_id: fromAcctId,
        amount: amt,
        currency,
        date,
        ...(description.trim() ? { description: description.trim() } : {}),
      })
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['household-analytics', householdId] }),
        qc.invalidateQueries({ queryKey: ['pending-transfers', householdId] }),
        invalidateFinancialData(qc),
      ])
      onClose()
    } catch (err) {
      setError(parseErr(err, 'No se pudo crear la transferencia'))
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="sheet bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">Transferencia entre miembros</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <p className="text-xs text-slate-400 mb-4">
          El receptor recibirá una solicitud pendiente y elegirá a qué cuenta acreditar el dinero.
        </p>

        <div className="space-y-3">

          {/* Recipient */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">¿A quién le transferís?</label>
            <div className="relative">
              <button
                onClick={() => setRecipientDd(v => !v)}
                className="w-full flex items-center justify-between bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-left text-slate-200"
              >
                <span className="truncate">{recipientName || 'Elegí un miembro'}</span>
                <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 ml-2" />
              </button>
              {recipientDd && (
                <div className="absolute top-full left-0 mt-1 z-[200] w-full bg-slate-900 border border-slate-700 rounded-xl shadow-xl py-1 max-h-40 overflow-y-auto">
                  {others.map(m => (
                    <button key={m.user_id} onClick={() => { setToUserId(m.user_id); setRecipientDd(false) }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-800 ${m.user_id === toUserId ? 'text-slate-200 font-semibold' : 'text-slate-400'}`}>
                      {m.user_name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Amount + currency */}
          <div className="flex gap-2">
            <div className="flex-1">
              <label className="text-xs text-slate-400 mb-1 block">Monto</label>
              <input
                type="number" min="0.01" step="0.01" value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500/60"
              />
            </div>
            <div className="w-24">
              <label className="text-xs text-slate-400 mb-1 block">Moneda</label>
              <input
                type="text" value={currency} maxLength={3}
                onChange={e => setCurrency(e.target.value.toUpperCase())}
                className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500/60 uppercase"
              />
            </div>
          </div>

          {/* From account */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">¿De qué cuenta tuya sale?</label>
            <div className="relative">
              <button
                onClick={() => setFromDd(v => !v)}
                className="w-full flex items-center justify-between bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-left text-slate-200"
              >
                <span className="truncate">
                  {selectedFrom ? `${selectedFrom.name} · ${selectedFrom.currency} · ${fmt(Number(selectedFrom.balance))}` : 'Elegí una cuenta'}
                </span>
                <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 ml-2" />
              </button>
              {fromDd && (
                <div className="absolute top-full left-0 mt-1 z-[200] w-full bg-slate-900 border border-slate-700 rounded-xl shadow-xl py-1 max-h-52 overflow-y-auto">
                  {myAccounts.map(a => (
                    <button key={a.id} onClick={() => { setFromAcctId(a.id); setFromDd(false) }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-800 ${a.id === fromAcctId ? 'text-slate-200 font-semibold' : 'text-slate-400'}`}>
                      {a.name} · {a.currency} · {fmt(Number(a.balance))}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Date */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Fecha</label>
            <DatePicker value={date} onChange={setDate} />
          </div>

          {/* Description */}
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Descripción <span className="text-slate-600">(opcional)</span></label>
            <input
              type="text" value={description} maxLength={200} onChange={e => setDescription(e.target.value)}
              placeholder="Ej: Te presto para el alquiler"
              className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500/60 w-full"
            />
          </div>

          {error && <p className="text-rose-400 text-xs">{error}</p>}

          <button
            onClick={handleSave} disabled={saving}
            className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 text-slate-950 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Enviar solicitud
          </button>
        </div>
      </div>
    </div>
  )
}
