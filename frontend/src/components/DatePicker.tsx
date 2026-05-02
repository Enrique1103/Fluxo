import { useState, useRef, useEffect } from 'react'
import { ChevronLeft, ChevronRight, CalendarDays } from 'lucide-react'

interface DatePickerProps {
  value: string                    // YYYY-MM-DD o ''
  onChange: (v: string) => void
  placeholder?: string
  className?: string
}

const MONTH_NAMES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]
const DAY_NAMES = ['Lu','Ma','Mi','Ju','Vi','Sá','Do']

function parseLocal(iso: string): Date | null {
  if (!iso) return null
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

function toISO(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

export default function DatePicker({
  value,
  onChange,
  placeholder = 'Seleccionar fecha',
  className = '',
}: DatePickerProps) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)

  const selected = parseLocal(value)
  const [open, setOpen] = useState(false)
  const [viewYear,  setViewYear]  = useState(selected?.getFullYear()  ?? today.getFullYear())
  const [viewMonth, setViewMonth] = useState(selected?.getMonth()     ?? today.getMonth())
  const ref     = useRef<HTMLDivElement>(null)
  const [flipUp, setFlipUp] = useState(false)

  // Sync view when value changes externally
  useEffect(() => {
    if (selected) {
      setViewYear(selected.getFullYear())
      setViewMonth(selected.getMonth())
    }
  }, [value])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const prevMonth = () => {
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11) }
    else setViewMonth(m => m - 1)
  }
  const nextMonth = () => {
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0) }
    else setViewMonth(m => m + 1)
  }

  const handleDay = (day: number) => {
    onChange(toISO(new Date(viewYear, viewMonth, day)))
    setOpen(false)
  }

  const handleToday = () => {
    onChange(toISO(today))
    setViewYear(today.getFullYear())
    setViewMonth(today.getMonth())
    setOpen(false)
  }

  // First day offset (Monday = 0)
  const firstDow = new Date(viewYear, viewMonth, 1).getDay()
  const startOffset = firstDow === 0 ? 6 : firstDow - 1
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate()

  const displayValue = selected
    ? `${String(selected.getDate()).padStart(2, '0')}/${String(selected.getMonth() + 1).padStart(2, '0')}/${selected.getFullYear()}`
    : ''

  const isSel = (day: number) =>
    !!selected &&
    selected.getFullYear() === viewYear &&
    selected.getMonth()    === viewMonth &&
    selected.getDate()     === day

  const isTod = (day: number) =>
    today.getFullYear() === viewYear &&
    today.getMonth()    === viewMonth &&
    today.getDate()     === day

  return (
    <div ref={ref} className={`relative ${className}`}>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => {
          if (!open && ref.current) {
            const rect = ref.current.getBoundingClientRect()
            setFlipUp(rect.bottom + 320 > window.innerHeight)
          }
          setOpen(o => !o)
        }}
        className="w-full flex items-center gap-3 bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm outline-none focus:border-emerald-500/60 hover:border-slate-600 transition-colors text-left text-slate-200"
      >
        <CalendarDays className="w-4 h-4 text-slate-500 shrink-0" />
        <span className={displayValue ? 'text-slate-200' : 'text-slate-500'}>
          {displayValue || placeholder}
        </span>
      </button>

      {/* Calendar popup */}
      {open && (
        <div className="absolute z-50 w-72 bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl p-4"
          style={flipUp ? { bottom: 'calc(100% + 6px)', left: 0 } : { top: 'calc(100% + 6px)', left: 0 }}>

          {/* Month/year navigation */}
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={prevMonth}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-sm font-semibold text-slate-200">
              {MONTH_NAMES[viewMonth]} {viewYear}
            </span>
            <button type="button" onClick={nextMonth}
              className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* Day names */}
          <div className="grid grid-cols-7 mb-1">
            {DAY_NAMES.map(d => (
              <div key={d} className="text-center text-[10px] font-semibold text-slate-600 py-1 uppercase tracking-wide">
                {d}
              </div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-y-0.5">
            {Array.from({ length: startOffset }).map((_, i) => <div key={`pad-${i}`} />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
              const day = i + 1
              const sel = isSel(day)
              const tod = isTod(day)
              return (
                <button
                  key={day}
                  type="button"
                  onClick={() => handleDay(day)}
                  className={`
                    w-full aspect-square flex items-center justify-center rounded-lg text-xs font-medium transition-all
                    ${sel
                      ? 'bg-emerald-500 text-white font-bold shadow-md shadow-emerald-500/30'
                      : tod
                      ? 'ring-1 ring-emerald-500/60 text-emerald-500 font-semibold'
                      : 'text-slate-300 hover:bg-slate-700 hover:text-white'
                    }
                  `}
                >
                  {day}
                </button>
              )
            })}
          </div>

          {/* Footer */}
          <div className="mt-3 pt-3 border-t border-slate-800 flex justify-between items-center">
            <button type="button" onClick={handleToday}
              className="text-xs text-emerald-400 hover:text-emerald-300 font-medium transition-colors">
              Hoy
            </button>
            {value && (
              <button type="button" onClick={() => { onChange(''); setOpen(false) }}
                className="text-xs text-slate-600 hover:text-slate-400 transition-colors">
                Limpiar
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
