import { useState } from 'react'
import useTheme from '../hooks/useTheme'

export const CAT_COLORS = [
  '#22d3ee','#f43f5e','#a78bfa','#fb923c','#34d399',
  '#facc15','#60a5fa','#f472b6','#4ade80','#e879f9',
]

export function catColor(idx: number) { return CAT_COLORS[idx % CAT_COLORS.length] }

export default function DonutChart({
  categories,
  income = 0,
  privacy,
  selectedCategory,
  onCategoryClick,
  mode = 'expense',
  size = 210,
}: {
  categories: { name: string; total: number }[]
  income?: number
  privacy: boolean
  selectedCategory?: string | null
  onCategoryClick?: (name: string | null) => void
  mode?: 'expense' | 'income'
  size?: number
}) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const [hovered, setHovered] = useState<number | null>(null)

  const total = categories.reduce((s, c) => s + c.total, 0)
  if (total === 0) return null

  const SIZE = 178, cx = 89, cy = 89, R = 73, r = 45
  const GAP = 0.022
  let angle = -Math.PI / 2

  const MIN_FRAC = 0.03
  const rawFracs  = categories.map(c => c.total / total)
  const dispFracs = rawFracs.map(f => Math.max(f, MIN_FRAC))
  const dispTotal = dispFracs.reduce((a, b) => a + b, 0)
  const normFracs = dispFracs.map(f => f / dispTotal)

  const slices = categories.map((cat, i) => {
    const frac   = rawFracs[i]
    const sweep  = normFracs[i] * Math.PI * 2
    const gap    = Math.min(GAP, sweep * 0.2)
    const start  = angle + gap / 2
    const end    = angle + sweep - gap / 2
    const mid    = angle + sweep / 2
    angle       += sweep
    return { frac, sweep, start, end, mid, color: catColor(i), name: cat.name, total: cat.total }
  })

  function arcPath(start: number, end: number) {
    const large = end - start > Math.PI ? 1 : 0
    const ox = cx + R * Math.cos(start), oy = cy + R * Math.sin(start)
    const ex = cx + R * Math.cos(end),   ey = cy + R * Math.sin(end)
    const ix = cx + r * Math.cos(end),   iy = cy + r * Math.sin(end)
    const bx = cx + r * Math.cos(start), by = cy + r * Math.sin(start)
    return `M ${ox} ${oy} A ${R} ${R} 0 ${large} 1 ${ex} ${ey} L ${ix} ${iy} A ${r} ${r} 0 ${large} 0 ${bx} ${by} Z`
  }

  const hasSelection = selectedCategory != null
  const hovSeg = hovered !== null ? slices[hovered] : null
  const textColor = isLight ? '#0f172a' : '#e2e8f0'
  const subColor  = isLight ? '#475569' : '#64748b'

  const fmtAmt = (v: number) =>
    privacy ? '****' : v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`

  return (
    <div className="shrink-0" onClick={() => onCategoryClick?.(null)}>
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} style={{ width: size, height: size }}>
        {slices.map((s, i) => {
          const isSelected = selectedCategory === s.name
          const dimmed = hovered !== null ? hovered !== i : hasSelection && !isSelected
          const dx = hovered === i ? Math.cos(s.mid) * 5 : 0
          const dy = hovered === i ? Math.sin(s.mid) * 5 : 0
          return (
            <path
              key={i}
              d={arcPath(s.start, s.end)}
              fill={s.color}
              fillOpacity={dimmed ? 0.25 : 0.9}
              stroke="#0f172a"
              strokeWidth="2"
              style={{
                cursor: 'pointer',
                transform: `translate(${dx}px, ${dy}px)`,
                transition: 'fill-opacity 0.15s, transform 0.15s',
              }}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              onClick={(e) => { e.stopPropagation(); onCategoryClick?.(isSelected ? null : s.name) }}
            />
          )
        })}

        {hovSeg ? (
          <>
            <text x={cx} y={cy - 16} textAnchor="middle"
              style={{ fontSize: '9px', fontWeight: 600, fill: hovSeg.color, letterSpacing: '0.02em' }}>
              {hovSeg.name.length > 12 ? hovSeg.name.slice(0, 11) + '…' : hovSeg.name}
            </text>
            <text x={cx} y={cy + 4} textAnchor="middle" fill={textColor} fontSize="16" fontWeight="700">
              {fmtAmt(hovSeg.total)}
            </text>
            <text x={cx} y={cy + 19} textAnchor="middle" fill={subColor} fontSize="10">
              {privacy ? '**%' : `${(hovSeg.frac * 100).toFixed(1)}%`}
            </text>
          </>
        ) : (
          <>
            <text x={cx} y={cy - 8} textAnchor="middle" fill={textColor} fontSize="15" fontWeight="700">
              {fmtAmt(total)}
            </text>
            <text x={cx} y={cy + 8} textAnchor="middle" fill={subColor} fontSize="9">
              {mode === 'income' ? 'en ingresos' : 'en gastos'}
            </text>
            {mode === 'expense' && income > 0 && (
              <text x={cx} y={cy + 22} textAnchor="middle" fill={isLight ? '#059669' : '#34d399'} fontSize="9.5" fontWeight="600">
                {privacy ? '**%' : `${((total / income) * 100).toFixed(0)}% del ing.`}
              </text>
            )}
          </>
        )}
      </svg>
    </div>
  )
}
