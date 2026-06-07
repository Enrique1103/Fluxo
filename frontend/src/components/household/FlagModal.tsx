import { useState } from 'react'
import { X, Flag, Loader2 } from 'lucide-react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createReview, FLAG_TYPE_LABELS } from '../../api/reviews'
import type { ReviewType } from '../../api/reviews'

interface Props {
  householdId: string
  transaction: {
    id: string
    concept_name: string
    category_name: string
    amount: number
    currency: string
    date: string
  }
  onClose: () => void
}

const FLAG_TYPES = Object.entries(FLAG_TYPE_LABELS) as [ReviewType, string][]

export default function FlagModal({ householdId, transaction, onClose }: Props) {
  const qc = useQueryClient()
  const [flagType, setFlagType] = useState<ReviewType>('monto_alto')
  const [comment, setComment]   = useState('')

  const mutation = useMutation({
    mutationFn: () => createReview({
      transaction_id: transaction.id,
      household_id:   householdId,
      flag_type:      flagType,
      comment:        comment.trim() || undefined,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['reviews', householdId] })
      onClose()
    },
  })

  const fmt = (n: number) =>
    n.toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-3xl bg-slate-900 border border-slate-800 shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Flag className="w-4 h-4 text-amber-400" />
            <span className="font-semibold text-slate-100 text-sm">Marcar transacción</span>
          </div>
          <button onClick={onClose} className="text-slate-500 hover:text-slate-300 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Transacción */}
        <div className="mx-5 mt-4 mb-1 px-4 py-3 rounded-2xl bg-slate-800/60 border border-slate-700/50">
          <p className="text-xs text-slate-500 mb-0.5">{transaction.date}</p>
          <p className="text-sm font-semibold text-slate-200 leading-tight">{transaction.category_name}</p>
          <p className="text-xs text-slate-500">{transaction.concept_name}</p>
          <p className="text-sm font-bold text-rose-400 mt-1 tabular-nums">
            -{fmt(transaction.amount)} {transaction.currency}
          </p>
        </div>

        <div className="px-5 pb-5 space-y-4 mt-4">
          {/* Tipo de flag */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2">Motivo</label>
            <div className="grid grid-cols-2 gap-2">
              {FLAG_TYPES.map(([type, label]) => (
                <button
                  key={type}
                  onClick={() => setFlagType(type)}
                  className={`px-3 py-2 rounded-xl text-xs font-medium text-left transition-all border ${
                    flagType === type
                      ? 'bg-amber-500/15 border-amber-500/40 text-amber-300'
                      : 'bg-slate-800 border-slate-700 text-slate-400 hover:bg-slate-700/60'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Comentario */}
          <div>
            <label className="block text-xs font-semibold text-slate-400 mb-2">
              Comentario <span className="font-normal text-slate-600">(opcional)</span>
            </label>
            <textarea
              value={comment}
              onChange={e => setComment(e.target.value)}
              maxLength={500}
              rows={3}
              placeholder="Agregá contexto o una pregunta..."
              className="w-full bg-slate-800 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500/60 transition-colors placeholder:text-slate-600 resize-none"
            />
            <p className="text-[10px] text-slate-600 text-right mt-1">{comment.length}/500</p>
          </div>

          {mutation.isError && (
            <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-xl px-3 py-2">
              Error al enviar la review. Intentá de nuevo.
            </p>
          )}

          {/* Acciones */}
          <div className="flex gap-2 pt-1">
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold border border-slate-700 text-slate-400 hover:bg-slate-800 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-amber-500 text-slate-900 hover:bg-amber-400 disabled:opacity-60 transition-colors flex items-center justify-center gap-2"
            >
              {mutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Enviando...</>
                : <><Flag className="w-3.5 h-3.5" /> Marcar</>
              }
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
