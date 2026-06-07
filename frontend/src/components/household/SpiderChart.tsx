import useTheme from '../../hooks/useTheme'

interface DataPoint {
  label: string
  value: number
}

interface Props {
  data: DataPoint[]
  color?: string
}

const SIZE   = 200
const CX     = SIZE / 2
const CY     = SIZE / 2
const R      = 70
const LEVELS = 4

function polarXY(cx: number, cy: number, r: number, i: number, n: number) {
  const a = -Math.PI / 2 + (2 * Math.PI * i) / n
  return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) }
}

function toPolygon(pts: { x: number; y: number }[]) {
  return pts.map(p => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ')
}

export default function SpiderChart({ data, color = '#818cf8' }: Props) {
  const { theme } = useTheme()
  const isLight = theme === 'light'

  const N = data.length
  if (N < 3) return null

  const maxVal = Math.max(...data.map(d => d.value), 1)

  const rings = Array.from({ length: LEVELS }, (_, k) => {
    const r = R * ((k + 1) / LEVELS)
    return data.map((_, i) => polarXY(CX, CY, r, i, N))
  })

  const axisPoints  = data.map((_, i) => polarXY(CX, CY, R,  i, N))
  const dataPoints  = data.map((d, i) =>
    polarXY(CX, CY, Math.max((d.value / maxVal) * R, 2), i, N)
  )

  const LABEL_R = R + 24
  const labels = data.map((d, i) => {
    const p   = polarXY(CX, CY, LABEL_R, i, N)
    const dx  = p.x - CX
    const anchor = (Math.abs(dx) < 6 ? 'middle' : dx < 0 ? 'end' : 'start') as 'middle' | 'end' | 'start'
    const text   = d.label.length > 12 ? d.label.slice(0, 11) + '…' : d.label
    return { ...p, anchor, text }
  })

  const fillBg   = isLight ? '#f8fafc' : '#0f172a'
  const gridClr  = isLight ? '#e2e8f0' : '#1e293b'
  const spokeClr = isLight ? '#cbd5e1' : '#334155'
  const labelClr = isLight ? '#64748b' : '#94a3b8'

  return (
    <svg
      viewBox={`-14 -18 ${SIZE + 28} ${SIZE + 32}`}
      className="w-full h-full"
      aria-label="Gráfico de radar por concepto"
    >
      {/* Background of outermost ring */}
      <polygon points={toPolygon(axisPoints)} fill={fillBg} stroke="none" />

      {/* Concentric N-gons */}
      {rings.map((pts, k) => (
        <polygon key={k} points={toPolygon(pts)} fill="none" stroke={gridClr} strokeWidth={0.75} />
      ))}

      {/* Axis spokes */}
      {axisPoints.map((p, i) => (
        <line key={i} x1={CX} y1={CY} x2={p.x} y2={p.y} stroke={spokeClr} strokeWidth={0.75} />
      ))}

      {/* Data polygon */}
      <polygon
        points={toPolygon(dataPoints)}
        fill={color}
        fillOpacity={0.2}
        stroke={color}
        strokeWidth={1.5}
        strokeLinejoin="round"
      />

      {/* Data dots */}
      {dataPoints.map((p, i) => (
        <circle key={i} cx={p.x} cy={p.y} r={2.5} fill={color} />
      ))}

      {/* Labels */}
      {labels.map((l, i) => (
        <text
          key={i}
          x={l.x}
          y={l.y}
          textAnchor={l.anchor}
          dominantBaseline="middle"
          style={{ fontSize: '8px', fill: labelClr, fontWeight: 500 }}
        >
          {l.text}
        </text>
      ))}
    </svg>
  )
}
