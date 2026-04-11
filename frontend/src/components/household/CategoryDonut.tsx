import { useState } from 'react'
import { DONUT_COLORS, fmtNum } from './household.utils'
import useTheme from '../../hooks/useTheme'

interface Props {
  categories: { name: string; total: number }[]
  total: number
  currency: string
}

export default function CategoryDonut({ categories, total, currency }: Props) {
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const [hovered, setHovered] = useState<number | null>(null)

  const SIZE = 190
  const cx = SIZE / 2
  const cy = SIZE / 2
  const R  = 78
  const ri = 50
  const GAP = 0.03

  type DonutSeg = { name: string; total: number; pct: number; color: string; d: string }

  const segs = (() => {
    let angle = -Math.PI / 2
    return categories.map((cat, i): DonutSeg | null => {
      const pct   = total > 0 ? cat.total / total : 0
      const sweep = pct * 2 * Math.PI
      const a1    = angle + GAP / 2
      const a2    = angle + sweep - GAP / 2
      angle      += sweep

      if (sweep < 0.02) return null

      const la = sweep - GAP > Math.PI ? 1 : 0
      const x1 = cx + R  * Math.cos(a1), y1 = cy + R  * Math.sin(a1)
      const x2 = cx + R  * Math.cos(a2), y2 = cy + R  * Math.sin(a2)
      const x3 = cx + ri * Math.cos(a2), y3 = cy + ri * Math.sin(a2)
      const x4 = cx + ri * Math.cos(a1), y4 = cy + ri * Math.sin(a1)

      return {
        name:  cat.name,
        total: cat.total,
        pct,
        color: DONUT_COLORS[i % DONUT_COLORS.length],
        d: `M${x1} ${y1} A${R} ${R} 0 ${la} 1 ${x2} ${y2} L${x3} ${y3} A${ri} ${ri} 0 ${la} 0 ${x4} ${y4}Z`,
      }
    }).filter((s): s is DonutSeg => s !== null)
  })()

  const hovSeg = hovered !== null ? segs[hovered] : null
  const textColor = isLight ? '#0f172a' : '#f1f5f9'

  return (
    <div className="flex flex-col items-center">
      <svg
        width={SIZE} height={SIZE}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        className="overflow-visible"
      >
        <defs>
          <filter id="seg-shadow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="2" stdDeviation="3" floodOpacity="0.25" />
          </filter>
        </defs>

        {total === 0 && (
          <circle
            cx={cx} cy={cy}
            r={(R + ri) / 2}
            fill="none"
            stroke={isLight ? '#e2e8f0' : '#1e293b'}
            strokeWidth={R - ri}
          />
        )}

        {segs.map((seg, i) => (
          <path
            key={i}
            d={seg.d}
            fill={seg.color}
            filter={hovered === i ? 'url(#seg-shadow)' : undefined}
            style={{
              opacity: hovered === null || hovered === i ? 1 : 0.35,
              transform: hovered === i
                ? `translate(${Math.cos(-Math.PI/2 + (i + 0.5) / segs.length * 2 * Math.PI) * 4}px, ${Math.sin(-Math.PI/2 + (i + 0.5) / segs.length * 2 * Math.PI) * 4}px)`
                : 'translate(0,0)',
              transition: 'all 0.2s ease',
              cursor: 'pointer',
            }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          />
        ))}

        {hovSeg ? (
          <>
            <text x={cx} y={cy - 14} textAnchor="middle"
              style={{ fontSize: '10px', fontWeight: 600, fill: hovSeg.color, letterSpacing: '0.02em' }}>
              {hovSeg.name.length > 13 ? hovSeg.name.slice(0, 12) + '…' : hovSeg.name}
            </text>
            <text x={cx} y={cy + 6} textAnchor="middle"
              style={{ fontSize: '17px', fontWeight: 700, fill: textColor }}>
              {fmtNum(hovSeg.total)}
            </text>
            <text x={cx} y={cy + 22} textAnchor="middle"
              style={{ fontSize: '11px', fill: '#64748b' }}>
              {(hovSeg.pct * 100).toFixed(1)}%
            </text>
          </>
        ) : (
          <>
            <text x={cx} y={cy - 10} textAnchor="middle"
              style={{ fontSize: '18px', fontWeight: 700, fill: textColor }}>
              {fmtNum(total)}
            </text>
            <text x={cx} y={cy + 8} textAnchor="middle"
              style={{ fontSize: '10px', fill: '#64748b' }}>
              {currency}
            </text>
            <text x={cx} y={cy + 23} textAnchor="middle"
              style={{ fontSize: '10px', fill: '#64748b' }}>
              compartido
            </text>
          </>
        )}
      </svg>

      <div className="w-full mt-3 space-y-1.5">
        {segs.map((seg, i) => (
          <div
            key={i}
            className="flex items-center gap-2 cursor-pointer rounded-lg px-1 py-0.5 transition-colors"
            style={{ opacity: hovered === null || hovered === i ? 1 : 0.45, transition: 'opacity 0.2s' }}
            onMouseEnter={() => setHovered(i)}
            onMouseLeave={() => setHovered(null)}
          >
            <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: seg.color }} />
            <span className={`text-[11px] truncate flex-1 ${isLight ? 'text-slate-600' : 'text-slate-400'}`}>
              {seg.name}
            </span>
            <span className="text-[11px] text-slate-500 shrink-0 tabular-nums">
              {(seg.pct * 100).toFixed(0)}%
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}
