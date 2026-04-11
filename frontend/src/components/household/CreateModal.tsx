import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, Loader2, X } from 'lucide-react'
import { createHousehold, type SplitType } from '../../api/households'
import { labelClass, inputClass, selectClass, parseErr } from './household.utils'

export default function CreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [name, setName] = useState('')
  const [currency, setCurrency] = useState('UYU')
  const [splitType, setSplitType] = useState<SplitType>('equal')
  const [error, setError] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: createHousehold,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['households'] }); onClose() },
    onError:   (err) => setError(parseErr(err, 'No se pudo crear el hogar')),
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Nuevo Hogar</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className={labelClass}>Nombre</label>
            <input autoFocus type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Ej: Casa compartida" className={inputClass} />
          </div>
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
          <div>
            <label className={labelClass + ' mb-2'}>División de gastos</label>
            <div className="grid grid-cols-2 gap-2">
              {(['equal', 'proportional'] as SplitType[]).map(t => (
                <button key={t} onClick={() => setSplitType(t)}
                  className={`py-2 rounded-xl text-xs font-semibold border transition-all ${splitType === t ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400' : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'}`}>
                  {t === 'equal' ? 'Partes iguales' : 'Proporcional'}
                </button>
              ))}
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">
              {splitType === 'equal' ? 'Cada miembro paga la misma parte.' : 'Cada miembro paga según % de sus ingresos.'}
            </p>
          </div>
          {error && <p className="text-rose-400 text-xs">{error}</p>}
          <button
            onClick={() => mutation.mutate({ name: name.trim(), base_currency: currency, split_type: splitType })}
            disabled={!name.trim() || mutation.isPending}
            className="w-full py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2">
            {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
            Crear hogar
          </button>
        </div>
      </div>
    </div>
  )
}
