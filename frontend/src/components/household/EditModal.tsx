import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Loader2, X } from 'lucide-react'
import { updateHousehold, deleteHousehold, type Household, type SplitType, type AnalysisLevel } from '../../api/households'
import { labelClass, selectClass, inputClass, parseErr } from './household.utils'

interface Props {
  household: Household
  onClose: () => void
}

const SPLIT_LABELS: Record<SplitType, string> = {
  equal:        'Partes iguales',
  proportional: 'Proporcional al ingreso',
}

const ANALYSIS_LABELS: Record<AnalysisLevel, string> = {
  expenses_only:      'Solo gastos',
  expenses_and_goals: 'Gastos + metas',
  full:               'Análisis completo',
}

export default function EditModal({ household, onClose }: Props) {
  const qc = useQueryClient()
  const [name,          setName]          = useState(household.name)
  const [currency,      setCurrency]      = useState(household.base_currency)
  const [error,         setError]         = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const updateMutation = useMutation({
    mutationFn: () => updateHousehold(household.id, {
      name:          name.trim(),
      base_currency: currency,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['households'] })
      qc.invalidateQueries({ queryKey: ['household-analytics', household.id] })
      onClose()
    },
    onError: (err) => setError(parseErr(err, 'No se pudo actualizar el hogar')),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteHousehold(household.id),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['households'] }); onClose() },
    onError:   (err) => setError(parseErr(err, 'No se pudo eliminar el hogar')),
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Configurar Hogar</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">
          {/* Nombre */}
          <div>
            <label className={labelClass}>Nombre</label>
            <input type="text" value={name} onChange={e => setName(e.target.value)} className={inputClass} />
          </div>

          {/* Moneda */}
          <div>
            <label className={labelClass}>Moneda base</label>
            <div className="relative">
              <select value={currency} onChange={e => setCurrency(e.target.value)} className={selectClass}>
                <option value="UYU">UYU</option>
                <option value="USD">USD</option>
                <option value="EUR">EUR</option>
              </select>
              <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
            </div>
          </div>

          {/* Configuración inmutable — badges de solo lectura */}
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-widest text-slate-500">Contrato del hogar</p>
            <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50">
              <span className="text-xs text-slate-400">División de gastos</span>
              <span className="text-xs font-semibold text-slate-300">
                {SPLIT_LABELS[household.split_type]}
              </span>
            </div>
            <div className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-slate-800/50 border border-slate-700/50">
              <span className="text-xs text-slate-400">Nivel de análisis</span>
              <span className="text-xs font-semibold text-slate-300">
                {ANALYSIS_LABELS[household.analysis_level ?? 'expenses_only']}
              </span>
            </div>
            <p className="text-[10px] text-slate-600 text-center pt-0.5">
              Para cambiarlos, creá un hogar nuevo.
            </p>
          </div>

          {error && <p className="text-rose-400 text-xs">{error}</p>}

          <button onClick={() => updateMutation.mutate()}
            disabled={!name.trim() || updateMutation.isPending}
            className="w-full py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2">
            {updateMutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar cambios
          </button>

          <div className="pt-2 border-t border-slate-800">
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)}
                className="w-full py-2 rounded-xl text-xs font-semibold text-rose-400 hover:bg-rose-500/10 border border-transparent hover:border-rose-500/20 transition-all">
                Eliminar hogar
              </button>
            ) : (
              <div className="space-y-2">
                <p className="text-xs text-rose-300 text-center">¿Seguro? Esta acción no se puede deshacer.</p>
                <div className="flex gap-2">
                  <button onClick={() => setConfirmDelete(false)}
                    className="flex-1 py-2 rounded-xl text-xs text-slate-400 bg-slate-800 hover:bg-slate-700 border border-slate-700 transition-all">
                    Cancelar
                  </button>
                  <button onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}
                    className="flex-1 py-2 rounded-xl text-xs font-bold text-white bg-rose-500/80 hover:bg-rose-500 transition-all flex items-center justify-center gap-1">
                    {deleteMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                    Eliminar
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
