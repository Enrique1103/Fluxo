import { useEffect, useState } from 'react'
import { X, Loader2, ChevronDown } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import DatePicker from '../DatePicker'
import { fetchAccounts, withoutArchived } from '../../api/dashboard'
import { paySettlement, confirmSettlement } from '../../api/households'
import { invalidateFinancialData } from '../../lib/queryClient'

/**
 * Balanceo del hogar.
 * - mode "pay": el que debe elige de qué cuenta sale la plata, la fecha y un comentario.
 * - mode "confirm": el que cobra elige a qué cuenta entró.
 * El monto no se escribe: lo calcula Hogar.
 */
type Props =
  | {
      mode: 'pay'; open: boolean; onClose: () => void
      householdId: string; year: number; month: number
      toUserId: string; otherName: string; amount: number; currency: string
    }
  | {
      mode: 'confirm'; open: boolean; onClose: () => void
      householdId: string; settlementId: string; paidDate: string
      otherName: string; amount: number; currency: string
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

export default function SettlementModal(props: Props) {
  const { open, onClose, mode, householdId, otherName, amount, currency } = props
  const qc = useQueryClient()
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'], queryFn: fetchAccounts, enabled: open, select: withoutArchived,
  })
  // Para cobrar, una tarjeta de crédito no tiene sentido; para pagar sí (se paga con la tarjeta)
  const options = mode === 'confirm' ? accounts.filter(a => a.type !== 'credit') : accounts

  const [accountId, setAccountId] = useState('')
  const [date, setDate] = useState(today())
  const [comment, setComment] = useState('')
  const [openDd, setOpenDd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (open) {
      setAccountId(''); setComment(''); setError(null); setOpenDd(false)
      setDate(mode === 'confirm' ? props.paidDate : today())
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  // Preseleccionar la primera cuenta en la moneda del hogar
  useEffect(() => {
    if (open && !accountId && options.length > 0) {
      setAccountId((options.find(a => a.currency === currency) ?? options[0]).id)
    }
  }, [open, options, accountId, currency])

  const selected = options.find(a => a.id === accountId)

  const handleSave = async () => {
    if (!accountId) { setError(mode === 'pay' ? 'Elegí de qué cuenta sale' : 'Elegí a qué cuenta entró'); return }
    if (!date) { setError('Elegí la fecha'); return }
    setSaving(true); setError(null)
    try {
      if (props.mode === 'pay') {
        await paySettlement(householdId, {
          year: props.year, month: props.month, to_user_id: props.toUserId,
          account_id: accountId, date, ...(comment.trim() ? { comment: comment.trim() } : {}),
        })
      } else {
        await confirmSettlement(householdId, props.settlementId, { account_id: accountId, date })
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ['household-analytics', householdId] }),
        invalidateFinancialData(qc),
      ])
      onClose()
    } catch (err) {
      setError(parseErr(err, 'No se pudo guardar'))
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="sheet bg-slate-900 border border-slate-800 rounded-t-3xl sm:rounded-3xl p-5 sm:p-6 w-full max-w-md shadow-2xl max-h-[92dvh] overflow-y-auto">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold text-white">
            {mode === 'pay' ? 'Registrar pago' : 'Confirmar recibido'}
          </h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="rounded-2xl bg-slate-800/60 border border-slate-700/60 p-4 mb-4 text-center">
          <p className="text-xs text-slate-400">{mode === 'pay' ? `Le pagás a ${otherName}` : `${otherName} te pagó`}</p>
          <p className="text-2xl font-bold text-white tabular-nums mt-1">{fmt(Number(amount))} <span className="text-sm text-slate-400">{currency}</span></p>
          <p className="text-[11px] text-slate-500 mt-1">
            {mode === 'pay'
              ? 'Se registra como gasto "Balanceo del Hogar".'
              : 'Se registra como "Reintegro del Hogar": resta de tus gastos, no suma como ingreso.'}
          </p>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-slate-400 mb-1 block">{mode === 'pay' ? '¿De qué cuenta sale?' : '¿A qué cuenta entró?'}</label>
            <div className="relative">
              <button
                onClick={() => setOpenDd(v => !v)}
                className="w-full flex items-center justify-between bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-left text-slate-200"
              >
                <span className="truncate">{selected ? `${selected.name} · ${selected.currency}` : 'Elegí una cuenta'}</span>
                <ChevronDown className="w-4 h-4 text-slate-500 shrink-0 ml-2" />
              </button>
              {openDd && (
                <div className="absolute top-full left-0 mt-1 z-[200] w-full bg-slate-900 border border-slate-700 rounded-xl shadow-xl py-1 max-h-52 overflow-y-auto">
                  {options.map(a => (
                    <button key={a.id} onClick={() => { setAccountId(a.id); setOpenDd(false) }}
                      className={`w-full text-left px-4 py-2 text-sm hover:bg-slate-800 ${a.id === accountId ? 'text-slate-200 font-semibold' : 'text-slate-400'}`}>
                      {a.name} · {a.currency} · {fmt(Number(a.balance))}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selected && selected.currency !== currency && (
              <p className="text-[11px] text-amber-400 mt-1">Se convierte de {currency} a {selected.currency} con la tasa del mes.</p>
            )}
          </div>

          <div>
            <label className="text-xs text-slate-400 mb-1 block">Fecha</label>
            <DatePicker value={date} onChange={setDate} />
          </div>

          {mode === 'pay' && (
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Comentario <span className="text-slate-600">(opcional)</span></label>
              <input
                type="text" value={comment} maxLength={100} onChange={e => setComment(e.target.value)}
                placeholder="Ej: Transferí por Prex"
                className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500/60 w-full"
              />
            </div>
          )}

          {error && <p className="text-rose-400 text-xs">{error}</p>}

          <button
            onClick={handleSave} disabled={saving}
            className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 text-slate-950 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {mode === 'pay' ? 'Registrar pago' : 'Confirmar'}
          </button>
        </div>
      </div>
    </div>
  )
}
