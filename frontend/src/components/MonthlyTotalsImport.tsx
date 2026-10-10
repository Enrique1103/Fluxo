import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarRange, Loader2, Plus, Trash2, X } from 'lucide-react'
import { fetchAccounts } from '../api/dashboard'
import {
  fetchMonthlyTotals,
  saveMonthlyTotals,
  deleteMonthlyTotal,
  type MonthlyTotalIn,
} from '../api/monthlyTotals'
import { invalidateFinancialData } from '../lib/queryClient'
import { useHomeCurrency } from '../hooks/useHomeCurrency'

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']

function monthLabel(year: number, month: number) {
  return `${MESES[month - 1]} ${year}`
}

/** "45.000,50" | "45,000.50" | "45000" | "$ 45.000" → 45000.5 */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/[^\d.,-]/g, '')
  if (!s) return null
  const lastDot = s.lastIndexOf('.')
  const lastComma = s.lastIndexOf(',')
  if (lastDot >= 0 && lastComma >= 0) {
    // El separador que aparece último es el decimal
    const dec = lastDot > lastComma ? '.' : ','
    const thou = dec === '.' ? ',' : '.'
    s = s.split(thou).join('').replace(dec, '.')
  } else if (lastComma >= 0 || lastDot >= 0) {
    const sep = lastComma >= 0 ? ',' : '.'
    const parts = s.split(sep)
    // "45.000" o "1,250,000" → miles; "45,5" o "45.50" → decimal
    const thousands = parts.length > 2 || (parts.length === 2 && parts[1].length === 3)
    s = thousands ? parts.join('') : parts.join('.')
  }
  const n = Number(s)
  return Number.isFinite(n) && n >= 0 ? n : null
}

/** "2025-03" | "2025/3" | "03/2025" | "3-2025" → {year, month} */
export function parseMonth(raw: string): { year: number; month: number } | null {
  const m1 = raw.trim().match(/^(\d{4})[-/.](\d{1,2})$/)
  const m2 = raw.trim().match(/^(\d{1,2})[-/.](\d{4})$/)
  const [year, month] = m1 ? [Number(m1[1]), Number(m1[2])] : m2 ? [Number(m2[2]), Number(m2[1])] : [0, 0]
  if (!year || month < 1 || month > 12) return null
  return { year, month }
}

interface ParsedLine { row?: MonthlyTotalIn; error?: string; line: string }

/** Una fila por mes: mes, ingresos, gastos — separado por tab (pegado de Excel), ';' o ','. */
function parsePasted(text: string, currency: string): ParsedLine[] {
  return text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l && !/^mes\b/i.test(l))
    .map(line => {
      // Con decimales con coma ("52.000,50") usar tab o ';' como separador
      const cols = line.includes('\t') ? line.split('\t')
        : line.includes(';') ? line.split(';')
        : line.split(',').length === 3 ? line.split(',')
        : line.split(/\s+/)
      if (cols.length < 3) return { line, error: 'Faltan columnas (mes, ingresos, gastos)' }
      const month = parseMonth(cols[0])
      const income = parseAmount(cols[1])
      const expense = parseAmount(cols[2])
      if (!month) return { line, error: 'Mes inválido (usá 2025-03 o 03/2025)' }
      if (income === null || expense === null) return { line, error: 'Monto inválido' }
      return { line, row: { ...month, currency, income, expense } }
    })
}

export default function MonthlyTotalsImport() {
  const qc = useQueryClient()
  const homeCurrency = useHomeCurrency()
  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts })
  const { data: saved = [], isLoading } = useQuery({ queryKey: ['monthly-totals'], queryFn: fetchMonthlyTotals })
  const currencies = useMemo(
    () => [...new Set([homeCurrency, ...accounts.map(a => a.currency), 'USD'])],
    [homeCurrency, accounts],
  )

  const [currency, setCurrency] = useState(homeCurrency)
  const [pasted, setPasted] = useState('')
  const [manual, setManual] = useState({ month: '', income: '', expense: '' })
  const [pending, setPending] = useState<MonthlyTotalIn[]>([])
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const parsed = useMemo(() => parsePasted(pasted, currency), [pasted, currency])
  const parseErrors = parsed.filter(p => p.error)

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['monthly-totals'] })
    await invalidateFinancialData(qc)
  }

  const saveMut = useMutation({
    mutationFn: saveMonthlyTotals,
    onSuccess: async r => {
      setPending([]); setPasted(''); setError(null)
      setResult(`${r.created} mes(es) agregados${r.updated ? `, ${r.updated} reemplazados` : ''}.`)
      await refresh()
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'No se pudieron guardar los totales')
    },
  })
  const delMut = useMutation({ mutationFn: deleteMonthlyTotal, onSuccess: refresh })

  const addRows = (rows: MonthlyTotalIn[]) => {
    setResult(null)
    setPending(prev => {
      const key = (r: MonthlyTotalIn) => `${r.year}-${r.month}-${r.currency}`
      const map = new Map(prev.map(r => [key(r), r]))
      rows.forEach(r => map.set(key(r), r))
      return [...map.values()].sort((a, b) => a.year - b.year || a.month - b.month)
    })
  }

  const addManual = () => {
    const month = parseMonth(manual.month)
    const income = parseAmount(manual.income || '0')
    const expense = parseAmount(manual.expense || '0')
    if (!month) { setError('Elegí el mes'); return }
    if (income === null || expense === null) { setError('Monto inválido'); return }
    setError(null)
    addRows([{ ...month, currency, income, expense }])
    setManual({ month: '', income: '', expense: '' })
  }

  const fmt = (n: number | string) => Number(n).toLocaleString('es-UY', { maximumFractionDigits: 2 })
  const input = 'w-full bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/50'

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-white mb-1">Importar totales mensuales</h2>
        <p className="text-sm text-slate-400 mb-5">
          Cargá solo el total de ingresos y de gastos de cada mes que registraste en otra app.
          No se crean comprobantes: Fenix los suma al gráfico Ingresos · Gastos · Ahorro y al patrimonio,
          y desde ahí seguís registrando día a día.
        </p>

        {accounts.length === 0 && (
          <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Todavía no tenés cuentas. Los totales se pueden cargar igual y el gráfico de ingresos y gastos
            se ve bien, pero el patrimonio de esos meses se calcula hacia atrás desde tu saldo actual:
            sin cuentas parte de 0 y queda negativo. Creá primero tus cuentas con el saldo que tienen hoy.
          </div>
        )}

        <div className="mb-4">
          <label className="block text-sm font-medium text-slate-400 mb-1">Moneda de los montos</label>
          <select value={currency} onChange={e => setCurrency(e.target.value)} className={input}>
            {currencies.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>

        <label className="block text-sm font-medium text-slate-400 mb-1">Pegar desde Excel o CSV</label>
        <textarea
          value={pasted}
          onChange={e => { setPasted(e.target.value); setResult(null) }}
          rows={5}
          placeholder={'Una fila por mes: mes, ingresos, gastos\n2025-03\t52.000\t41.300\n2025-04\t52.000\t38.950'}
          className={`${input} font-mono text-xs`}
        />
        {pasted.trim() && (
          <div className="flex items-center justify-between mt-2">
            <span className="text-xs text-slate-500">
              {parsed.length - parseErrors.length} fila(s) válidas
              {parseErrors.length > 0 && <span className="text-rose-400"> · {parseErrors.length} con error</span>}
            </span>
            <button
              onClick={() => addRows(parsed.flatMap(p => (p.row ? [p.row] : [])))}
              disabled={parsed.length === parseErrors.length}
              className="text-xs font-medium text-emerald-400 hover:text-emerald-300 disabled:opacity-40"
            >
              Agregar a la lista
            </button>
          </div>
        )}
        {parseErrors.slice(0, 3).map(p => (
          <p key={p.line} className="text-xs text-rose-400 mt-1 truncate">"{p.line}": {p.error}</p>
        ))}

        <div className="mt-5">
          <label className="block text-sm font-medium text-slate-400 mb-1">O cargá un mes a mano</label>
          <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_auto] gap-2">
            <input type="month" value={manual.month} onChange={e => setManual(m => ({ ...m, month: e.target.value }))} className={input} />
            <input inputMode="decimal" placeholder="Ingresos" value={manual.income} onChange={e => setManual(m => ({ ...m, income: e.target.value }))} className={input} />
            <input inputMode="decimal" placeholder="Gastos" value={manual.expense} onChange={e => setManual(m => ({ ...m, expense: e.target.value }))} className={input} />
            <button onClick={addManual} className="flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm text-slate-200">
              <Plus className="w-4 h-4" /> Agregar
            </button>
          </div>
        </div>

        {pending.length > 0 && (
          <div className="mt-5">
            <p className="text-sm font-medium text-slate-300 mb-2">Para guardar ({pending.length})</p>
            <div className="flex flex-col gap-1.5">
              {pending.map(r => (
                <div key={`${r.year}-${r.month}-${r.currency}`} className="flex items-center justify-between text-sm bg-slate-800/40 rounded-xl px-4 py-2">
                  <span className="text-slate-300 w-24">{monthLabel(r.year, r.month)}</span>
                  <span className="text-cyan-400 tabular-nums">+{fmt(r.income)}</span>
                  <span className="text-rose-400 tabular-nums">-{fmt(r.expense)}</span>
                  <span className="text-slate-500 text-xs">{r.currency}</span>
                  <button onClick={() => setPending(p => p.filter(x => x !== r))} className="text-slate-600 hover:text-slate-300">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-2">Si un mes ya estaba cargado en la misma moneda, se reemplaza.</p>
            <button
              onClick={() => saveMut.mutate(pending)}
              disabled={saveMut.isPending}
              className="mt-3 w-full flex items-center justify-center gap-2 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm disabled:opacity-50"
            >
              {saveMut.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
              Guardar {pending.length} mes(es)
            </button>
          </div>
        )}
        {error && <p className="text-sm text-rose-400 mt-3">{error}</p>}
        {result && <p className="text-sm text-emerald-400 mt-3">{result}</p>}
      </div>

      <div className="border border-slate-800/50 rounded-2xl overflow-hidden">
        <div className="flex items-center gap-2 px-5 py-3.5 bg-slate-900/50 text-sm font-medium text-slate-300">
          <CalendarRange className="w-4 h-4 text-slate-500" />
          Totales cargados <span className="text-xs text-slate-600 font-normal">({saved.length})</span>
        </div>
        <div className="flex flex-col gap-1.5 p-3 bg-slate-950/40">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-slate-500 mx-auto my-3" />
          ) : saved.length === 0 ? (
            <p className="text-sm text-slate-600 text-center py-3">Todavía no cargaste totales.</p>
          ) : saved.map(t => (
            <div key={t.id} className="flex items-center justify-between text-sm bg-slate-900/60 rounded-xl px-4 py-2.5">
              <span className="text-slate-300 w-24">{monthLabel(t.year, t.month)}</span>
              <span className="text-cyan-400 tabular-nums">+{fmt(t.income)}</span>
              <span className="text-rose-400 tabular-nums">-{fmt(t.expense)}</span>
              <span className="text-slate-500 text-xs">{t.currency}</span>
              {confirmDelete === t.id ? (
                <button onClick={() => { delMut.mutate(t.id); setConfirmDelete(null) }} className="text-xs text-rose-400 font-medium">
                  ¿Borrar?
                </button>
              ) : (
                <button onClick={() => setConfirmDelete(t.id)} className="text-slate-600 hover:text-rose-400" title="Borrar">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
