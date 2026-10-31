import { BASE_KINDS, BASE_KIND_LABELS, kindFromParts, kindParts, type CategoryKind } from '../api/dashboard'

/**
 * "Se usa para": se pueden marcar uno, dos o los tres tipos de movimiento.
 * Siempre queda al menos uno marcado.
 */
export default function KindPicker({ value, onChange }: { value: CategoryKind; onChange: (k: CategoryKind) => void }) {
  const parts = kindParts(value)
  return (
    <div className="flex gap-1 flex-wrap items-center">
      <span className="text-[10px] text-slate-500 mr-1">Se usa para:</span>
      {BASE_KINDS.map(k => {
        const on = parts.includes(k)
        return (
          <button key={k} type="button"
            onClick={() => {
              const next = on ? parts.filter(p => p !== k) : [...parts, k]
              if (next.length > 0) onChange(kindFromParts(next))
            }}
            aria-pressed={on}
            className={`px-2 py-0.5 rounded-md text-[10px] border transition-colors ${on ? 'border-emerald-500/50 bg-emerald-500/15 text-emerald-300' : 'border-slate-600 text-slate-400 hover:text-slate-200'}`}>
            {on ? '✓ ' : ''}{BASE_KIND_LABELS[k]}
          </button>
        )
      })}
    </div>
  )
}
