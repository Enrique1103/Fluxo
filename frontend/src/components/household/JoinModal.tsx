import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Loader2, UserCheck, X } from 'lucide-react'
import { joinHousehold } from '../../api/households'
import { labelClass, parseErr } from './household.utils'

export default function JoinModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [joined, setJoined] = useState(false)

  const mutation = useMutation({
    mutationFn: joinHousehold,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['households'] }); setJoined(true) },
    onError:   (err) => setError(parseErr(err, 'Código inválido o expirado')),
  })

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Unirse a un Hogar</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {joined ? (
          <div className="space-y-4 text-center py-2">
            <div className="w-12 h-12 rounded-2xl bg-indigo-500/20 flex items-center justify-center mx-auto">
              <UserCheck className="w-6 h-6 text-indigo-400" />
            </div>
            <div>
              <p className="text-white font-semibold text-sm">Solicitud enviada</p>
              <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                Tu solicitud fue recibida. El administrador del hogar debe aprobarte antes de que puedas ver el contenido.
              </p>
            </div>
            <button onClick={onClose}
              className="w-full py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-sm font-semibold transition-colors">
              Entendido
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Código de invitación</label>
              <input autoFocus type="text" value={code} onChange={e => setCode(e.target.value.toUpperCase())}
                placeholder="Ej: AB3X7K2M"
                className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-indigo-500/60 transition-colors w-full font-mono tracking-widest" />
            </div>
            {error && <p className="text-rose-400 text-xs">{error}</p>}
            <button onClick={() => mutation.mutate(code.trim())}
              disabled={!code.trim() || mutation.isPending}
              className="w-full py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 disabled:opacity-50 text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2">
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Unirse
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
