import { useState, useEffect } from 'react'
import { AlertTriangle, Home, Trash2, X } from 'lucide-react'

interface Transaction {
  id: string
  concept_name: string
  amount: number
  date: string
  household_id: string | null
}

interface Props {
  tx: Transaction | null
  onConfirm: (scope: 'personal' | 'household') => void
  onCancel: () => void
}

export default function DeleteTransactionModal({ tx, onConfirm, onCancel }: Props) {
  const [scope, setScope] = useState<'personal' | 'household'>('household')

  // Reset al abrir un tx diferente
  useEffect(() => {
    if (tx?.household_id) setScope('household')
    else setScope('personal')
  }, [tx?.id, tx?.household_id])

  useEffect(() => {
    if (!tx) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [tx, onCancel])

  if (!tx) return null

  const hasHousehold = tx.household_id !== null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onCancel} />

      <div className="relative z-10 bg-slate-900 border border-slate-700/80 rounded-2xl p-6 shadow-2xl w-full max-w-sm mx-4">
        <button onClick={onCancel} className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition-colors">
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="flex items-start gap-3 mb-5">
          <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 bg-red-500/15">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div className="pt-0.5">
            <h3 className="text-white font-semibold text-sm">Eliminar transacción</h3>
            <p className="text-slate-400 text-xs mt-1 leading-relaxed">
              <span className="font-medium text-slate-300">{tx.concept_name}</span>
              {' — '}
              {tx.date}
            </p>
          </div>
        </div>

        {/* Caso A: sin hogar — confirmación simple */}
        {!hasHousehold && (
          <p className="text-sm text-slate-400 mb-5 leading-relaxed">
            Esta acción no se puede deshacer. ¿Confirmás que querés eliminar este movimiento?
          </p>
        )}

        {/* Caso B: con hogar — selector de scope */}
        {hasHousehold && (
          <div className="mb-5 space-y-2">
            <p className="text-xs text-slate-500 flex items-center gap-1.5 mb-3">
              <Home className="w-3.5 h-3.5 text-indigo-400" />
              Esta transacción está asociada a un hogar.
            </p>

            {/* Opción: solo del hogar */}
            <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
              scope === 'household'
                ? 'bg-indigo-500/10 border-indigo-500/40'
                : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
            }`}>
              <input
                type="radio"
                name="scope"
                value="household"
                checked={scope === 'household'}
                onChange={() => setScope('household')}
                className="mt-0.5 accent-indigo-500"
              />
              <div>
                <p className="text-sm font-medium text-slate-200">Sacar solo del hogar</p>
                <p className="text-xs text-slate-500 mt-0.5">Se mantiene en tus finanzas personales</p>
              </div>
            </label>

            {/* Opción: eliminar completamente */}
            <label className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
              scope === 'personal'
                ? 'bg-red-500/10 border-red-500/40'
                : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
            }`}>
              <input
                type="radio"
                name="scope"
                value="personal"
                checked={scope === 'personal'}
                onChange={() => setScope('personal')}
                className="mt-0.5 accent-red-500"
              />
              <div>
                <p className="text-sm font-medium text-slate-200">Eliminar completamente</p>
                <p className="text-xs text-slate-500 mt-0.5">Se elimina de personal y del hogar. No se puede deshacer.</p>
              </div>
            </label>
          </div>
        )}

        {/* Botones */}
        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
          >
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(hasHousehold ? scope : 'personal')}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-bold rounded-xl transition-all active:scale-95 ${
              (!hasHousehold || scope === 'personal')
                ? 'bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-500/20'
                : 'bg-indigo-500 hover:bg-indigo-400 text-white shadow-lg shadow-indigo-500/20'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            {!hasHousehold || scope === 'personal' ? 'Eliminar' : 'Sacar del hogar'}
          </button>
        </div>
      </div>
    </div>
  )
}
