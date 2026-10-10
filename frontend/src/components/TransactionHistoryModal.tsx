import { useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { History as HistoryIcon, X, Loader2 } from 'lucide-react'
import {
  fetchTransactionHistory,
  fetchRecentHistory,
  type TransactionHistoryEntry,
} from '../api/dashboard'

interface Props {
  open: boolean
  /** Con txId muestra el historial de ese movimiento; sin txId, la actividad reciente. */
  txId?: string
  onClose: () => void
}

const ACTION_LABEL: Record<TransactionHistoryEntry['action'], string> = {
  create: 'Creado',
  update: 'Editado',
  delete: 'Eliminado',
}
const ACTION_COLOR: Record<TransactionHistoryEntry['action'], string> = {
  create: 'text-emerald-400 bg-emerald-500/10',
  update: 'text-amber-400 bg-amber-500/10',
  delete: 'text-rose-400 bg-rose-500/10',
}
const FIELD_LABEL: Record<string, string> = {
  amount: 'Monto',
  date: 'Fecha',
  description: 'Comentario',
  category_name: 'Categoría',
  concept_name: 'Concepto',
  metodo_pago: 'Método',
  household_ids: 'Hogares',
}
const TYPE_LABEL: Record<string, string> = { income: 'Ingreso', expense: 'Gasto', transfer: 'Transferencia' }

function fmtValue(field: string, v: unknown): string {
  if (v === null || v === undefined || v === '') return '—'
  if (field === 'household_ids') return Array.isArray(v) && v.length ? `${v.length} hogar(es)` : 'ninguno'
  return String(v)
}

function fmtWhen(iso: string): string {
  const d = new Date(/Z$|[+-]\d\d:\d\d$/.test(iso) ? iso : iso + 'Z')
  return d.toLocaleString('es-UY', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function Entry({ e, showTitle }: { e: TransactionHistoryEntry; showTitle: boolean }) {
  const s = e.snapshot
  const cur = s.account_currency ?? ''
  return (
    <li className="border border-slate-800 rounded-xl p-3 bg-slate-800/30">
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${ACTION_COLOR[e.action]}`}>
          {ACTION_LABEL[e.action]}
        </span>
        <span className="text-[11px] text-slate-500">{fmtWhen(e.created_at)}</span>
      </div>
      {showTitle && (
        <p className="text-sm text-slate-200 truncate">
          {TYPE_LABEL[String(s.type)] ?? s.type} · {s.concept_name ?? s.category_name ?? 'Sin concepto'} · {s.amount} {cur}
          <span className="text-slate-500"> · {s.date}</span>
        </p>
      )}
      {e.action === 'update' && e.changes && (
        <ul className="mt-1 space-y-0.5">
          {Object.entries(e.changes).map(([field, [before, after]]) => (
            <li key={field} className="text-xs text-slate-400">
              <span className="text-slate-500">{FIELD_LABEL[field] ?? field}:</span>{' '}
              <span className="line-through text-slate-600">{fmtValue(field, before)}</span>{' → '}
              <span className="text-slate-200">{fmtValue(field, after)}</span>
            </li>
          ))}
        </ul>
      )}
      {e.action !== 'update' && !showTitle && (
        <p className="text-xs text-slate-400">
          {s.amount} {cur} · {s.date}{s.description ? ` · ${s.description}` : ''}
        </p>
      )}
      {s.destination_amount && (
        <p className="text-xs text-slate-500 mt-1">
          Llegaron {s.destination_amount} {s.destination_currency} a {s.destination_account_name}
          {s.commission ? ` · comisión ${s.commission} ${cur}` : ''}
        </p>
      )}
      {s.account_balance && (
        <p className="text-[11px] text-slate-600 mt-1">
          Saldo de {s.account_name} {e.action === 'delete' ? 'antes de eliminar' : 'después'}: {s.account_balance} {cur}
        </p>
      )}
    </li>
  )
}

export default function TransactionHistoryModal({ open, txId, onClose }: Props) {
  const { data = [], isLoading } = useQuery({
    queryKey: ['tx-history', txId ?? 'recent'],
    queryFn: () => (txId ? fetchTransactionHistory(txId) : fetchRecentHistory(100)),
    enabled: open,
    staleTime: 0,
  })

  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onClose])

  if (!open) return null

  // Historial de un movimiento: el más reciente arriba (igual que la actividad reciente)
  const entries = txId ? [...data].reverse() : data

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 bg-slate-900 border border-slate-700/80 rounded-2xl p-5 shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition-colors">
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center gap-2 mb-4">
          <HistoryIcon className="w-4 h-4 text-indigo-400" />
          <h3 className="text-white font-semibold text-sm">
            {txId ? 'Historial del movimiento' : 'Actividad reciente'}
          </h3>
        </div>
        <div className="overflow-y-auto -mr-2 pr-2">
          {isLoading ? (
            <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
          ) : entries.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-8">
              {txId
                ? 'Sin cambios registrados. El historial empezó a guardarse con esta versión.'
                : 'Todavía no hay actividad registrada.'}
            </p>
          ) : (
            <ul className="space-y-2">
              {entries.map(e => <Entry key={e.id} e={e} showTitle={!txId} />)}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
