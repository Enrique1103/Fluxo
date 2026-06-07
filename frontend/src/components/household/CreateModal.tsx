import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Loader2, X, AlertTriangle } from 'lucide-react'
import { createHousehold, type SplitType, type AnalysisLevel } from '../../api/households'
import { labelClass, inputClass, parseErr } from './household.utils'

type Step = 1 | 2 | 3

const SPLIT_OPTIONS: { value: SplitType; label: string; desc: string }[] = [
  { value: 'equal',        label: '⚖️ Partes iguales',       desc: 'Cada gasto se divide en partes iguales. Ideal para roommates o parejas con ingresos similares.' },
  { value: 'proportional', label: '📊 Proporcional al ingreso', desc: 'Quien gana más, paga más. Ideal para parejas con ingresos dispares o familias.' },
]

const ANALYSIS_OPTIONS: { value: AnalysisLevel; label: string; desc: string; warn?: string }[] = [
  { value: 'expenses_only',      label: '💸 Solo control de gastos',  desc: 'Ven en qué gastan en común y cuánto debe cada uno. Ideal para roommates y hogares grandes.' },
  { value: 'expenses_and_goals', label: '🎯 Gastos + metas conjuntas', desc: 'Lo anterior más metas compartidas (viaje, casa, etc.). Ideal para grupos con objetivos comunes.' },
  { value: 'full',               label: '📈 Análisis completo',       desc: 'Gastos + ingresos aportados + metas + ahorro neto.', warn: 'Los miembros verán los ingresos que cada uno aporte al hogar.' },
]

export default function CreateModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient()
  const [step,          setStep]          = useState<Step>(1)
  const [name,          setName]          = useState('')
  const [currency,      setCurrency]      = useState('UYU')
  const [splitType,     setSplitType]     = useState<SplitType>('equal')
  const [analysisLevel, setAnalysisLevel] = useState<AnalysisLevel>('expenses_only')
  const [error,         setError]         = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: createHousehold,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['households'] }); onClose() },
    onError:   (err) => setError(parseErr(err, 'No se pudo crear el hogar')),
  })

  const handleCreate = () => {
    mutation.mutate({
      name: name.trim(),
      base_currency: currency,
      split_type: splitType,
      analysis_level: analysisLevel,
    })
  }

  const stepLabel = (s: Step) =>
    s === 1 ? 'Nombre' : s === 2 ? 'División' : 'Análisis'

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-1">
          <div className="flex items-center gap-2">
            {step > 1 && (
              <button onClick={() => setStep((step - 1) as Step)}
                className="p-1 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors">
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-base font-semibold text-white">Nuevo hogar</h2>
          </div>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Paso indicator */}
        <div className="flex items-center gap-1.5 mb-5">
          {([1, 2, 3] as Step[]).map(s => (
            <div key={s} className="flex items-center gap-1.5">
              <div className={`flex items-center justify-center w-5 h-5 rounded-full text-[10px] font-bold transition-all ${
                s === step ? 'bg-indigo-500 text-white' :
                s < step   ? 'bg-indigo-500/30 text-indigo-400' :
                             'bg-slate-800 text-slate-600'
              }`}>{s}</div>
              <span className={`text-[10px] ${s === step ? 'text-slate-300' : 'text-slate-600'}`}>
                {stepLabel(s)}
              </span>
              {s < 3 && <div className="w-4 h-px bg-slate-700 mx-0.5" />}
            </div>
          ))}
        </div>

        {/* ── Paso 1: Nombre + moneda ── */}
        {step === 1 && (
          <div className="space-y-4">
            <div>
              <label className={labelClass}>Nombre del hogar</label>
              <input autoFocus type="text" value={name} onChange={e => setName(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && name.trim() && setStep(2)}
                placeholder="Ej: Casa compartida, Pareja, Familia…"
                className={inputClass} />
            </div>
            <div>
              <label className={labelClass}>Moneda base</label>
              <div className="grid grid-cols-3 gap-2">
                {['UYU', 'USD', 'EUR'].map(c => (
                  <button key={c} onClick={() => setCurrency(c)}
                    className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                      currency === c
                        ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400'
                        : 'bg-slate-800 border-slate-700 text-slate-400 hover:text-slate-200'
                    }`}>
                    {c}
                  </button>
                ))}
              </div>
            </div>
            <button
              onClick={() => setStep(2)}
              disabled={!name.trim()}
              className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-all">
              Siguiente →
            </button>
          </div>
        )}

        {/* ── Paso 2: División de gastos ── */}
        {step === 2 && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 mb-3">¿Cómo se reparten los gastos compartidos?</p>
            {SPLIT_OPTIONS.map(opt => (
              <label key={opt.value}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  splitType === opt.value
                    ? 'bg-indigo-500/10 border-indigo-500/40'
                    : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                }`}>
                <input type="radio" name="split" value={opt.value}
                  checked={splitType === opt.value}
                  onChange={() => setSplitType(opt.value)}
                  className="mt-0.5 accent-indigo-500" />
                <div>
                  <p className="text-sm font-semibold text-slate-200">{opt.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{opt.desc}</p>
                </div>
              </label>
            ))}
            <button
              onClick={() => setStep(3)}
              className="w-full py-2.5 bg-indigo-500 hover:bg-indigo-400 text-white rounded-xl text-sm font-bold transition-all mt-1">
              Siguiente →
            </button>
          </div>
        )}

        {/* ── Paso 3: Nivel de análisis ── */}
        {step === 3 && (
          <div className="space-y-3">
            <p className="text-xs text-slate-500 mb-3">¿Qué tipo de análisis necesitan?</p>
            {ANALYSIS_OPTIONS.map(opt => (
              <label key={opt.value}
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  analysisLevel === opt.value
                    ? 'bg-indigo-500/10 border-indigo-500/40'
                    : 'bg-slate-800/50 border-slate-700 hover:border-slate-600'
                }`}>
                <input type="radio" name="analysis" value={opt.value}
                  checked={analysisLevel === opt.value}
                  onChange={() => setAnalysisLevel(opt.value)}
                  className="mt-0.5 accent-indigo-500" />
                <div>
                  <p className="text-sm font-semibold text-slate-200">{opt.label}</p>
                  <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{opt.desc}</p>
                  {opt.warn && analysisLevel === opt.value && (
                    <div className="flex items-start gap-1.5 mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-400 shrink-0 mt-0.5" />
                      <p className="text-[11px] text-amber-300 leading-relaxed">{opt.warn}</p>
                    </div>
                  )}
                </div>
              </label>
            ))}
            {error && <p className="text-rose-400 text-xs">{error}</p>}
            <button
              onClick={handleCreate}
              disabled={mutation.isPending}
              className="w-full py-2.5 bg-gradient-to-r from-indigo-500 to-purple-500 hover:from-indigo-400 hover:to-purple-400 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 mt-1">
              {mutation.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Crear hogar
            </button>
          </div>
        )}

      </div>
    </div>
  )
}
