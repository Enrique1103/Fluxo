import { fmtNum } from './household.utils'
import type { ConceptBreakdown } from '../../api/households'

interface Props {
  concepts: ConceptBreakdown[]
  totalShared: number
  currency: string
  privacy: boolean
}

export default function HouseholdTopConcepts({ concepts, totalShared, privacy }: Props) {
  if (concepts.length === 0) return null

  const fmt      = (n: number) => privacy ? '••••' : fmtNum(n)
  const maxTotal = concepts[0]?.total ?? 1

  return (
    <div className="rounded-3xl border overflow-hidden bg-slate-900 border-slate-800">
      <div className="px-5 py-4 border-b border-slate-800">
        <p className="text-xs font-semibold uppercase tracking-widest text-slate-500">Top conceptos</p>
      </div>
      <div className="p-5 space-y-3">
        {concepts.map((c, i) => {
          const pct = totalShared > 0 ? c.total / totalShared : 0
          return (
            <div key={c.concept_name}>
              <div className="flex items-center gap-2 mb-1.5">
                <span className="text-[10px] font-bold text-slate-600 tabular-nums w-4 shrink-0">{i + 1}</span>
                <span className="text-xs flex-1 truncate text-slate-300">{c.concept_name}</span>
                <span className="text-[10px] text-slate-500 tabular-nums shrink-0">
                  {c.transaction_count} tx · {(pct * 100).toFixed(0)}%
                </span>
                <span className="text-xs font-semibold tabular-nums shrink-0 text-slate-200">
                  {fmt(c.total)}
                </span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden bg-slate-800">
                <div
                  className="h-full rounded-full bg-violet-500 transition-all duration-700"
                  style={{ width: `${Math.max((c.total / maxTotal) * 100, 3)}%` }}
                />
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
