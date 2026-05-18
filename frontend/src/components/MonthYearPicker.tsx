import { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'

const MONTHS = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']

interface Props {
  month: number     // 1–12 selected
  year: number      // selected
  maxYear: number   // inclusive upper bound
  maxMonth: number  // inclusive upper bound month (1–12) within maxYear
  onChange: (month: number, year: number) => void
  onClose: () => void
}

export default function MonthYearPicker({ month, year, maxYear, maxMonth, onChange, onClose }: Props) {
  const [pickerYear, setPickerYear] = useState(year)

  const isDisabled = (m: number) =>
    pickerYear > maxYear || (pickerYear === maxYear && m > maxMonth)

  const isSelected = (m: number) => pickerYear === year && m === month

  return (
    <div className="absolute top-full left-0 mt-1 z-[200] bg-slate-900 border border-slate-700 rounded-2xl shadow-xl p-3 w-52">
      {/* Year navigation */}
      <div className="flex items-center justify-between mb-3">
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={() => setPickerYear(y => y - 1)}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
        >
          <ChevronLeft className="w-3.5 h-3.5" />
        </button>
        <span className="text-sm font-bold text-slate-200 tabular-nums">{pickerYear}</span>
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={() => setPickerYear(y => y + 1)}
          disabled={pickerYear >= maxYear}
          className="p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors disabled:opacity-25 disabled:cursor-not-allowed"
        >
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>

      {/* Month grid 4 × 3 */}
      <div className="grid grid-cols-4 gap-1">
        {MONTHS.map((name, i) => {
          const m = i + 1
          const disabled = isDisabled(m)
          const selected = isSelected(m)
          return (
            <button
              key={m}
              onMouseDown={e => e.preventDefault()}
              onClick={() => {
                if (disabled) return
                onChange(m, pickerYear)
                onClose()
              }}
              disabled={disabled}
              className={`py-1.5 rounded-lg text-[11px] font-medium transition-colors ${
                selected
                  ? 'bg-indigo-500 text-white font-semibold'
                  : disabled
                  ? 'text-slate-700 cursor-not-allowed'
                  : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200'
              }`}
            >
              {name}
            </button>
          )
        })}
      </div>
    </div>
  )
}
