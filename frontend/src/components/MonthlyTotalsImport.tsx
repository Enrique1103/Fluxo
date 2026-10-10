import { useMemo, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CalendarRange, Download, FileSpreadsheet, Loader2, Plus, Trash2, Upload, X } from 'lucide-react'
import { fetchAccounts } from '../api/dashboard'
import {
  fetchMonthlyTotals,
  saveMonthlyTotals,
  deleteMonthlyTotal,
  parseMonthlyTotalsFile,
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
  const [manual, setManual] = useState({ month: '', income: '', expense: '' })
  const [pending, setPending] = useState<MonthlyTotalIn[]>([])
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)
  const [fileErrors, setFileErrors] = useState<{ row: number; message: string }[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ['monthly-totals'] })
    await invalidateFinancialData(qc)
  }

  const saveMut = useMutation({
    mutationFn: saveMonthlyTotals,
    onSuccess: async r => {
      setPending([]); setError(null)
      setResult(`${r.created} mes(es) agregados${r.updated ? `, ${r.updated} reemplazados` : ''}.`)
      await refresh()
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      setError(typeof detail === 'string' ? detail : 'No se pudieron guardar los totales')
    },
  })
  const delMut = useMutation({ mutationFn: deleteMonthlyTotal, onSuccess: refresh })
  const parseMut = useMutation({
    mutationFn: (file: File) => parseMonthlyTotalsFile(file, homeCurrency),
    onSuccess: r => {
      setError(null)
      setFileErrors(r.errors)
      if (r.rows.length === 0 && r.errors.length === 0) setError('La planilla no tiene meses con montos cargados')
      addRows(r.rows.map(x => ({ ...x, income: Number(x.income), expense: Number(x.expense) })))
    },
    onError: (err: unknown) => {
      const detail = (err as { response?: { data?: { detail?: unknown } } })?.response?.data?.detail
      setFileErrors([])
      setError(typeof detail === 'string' ? detail : 'No se pudo leer la planilla')
    },
  })

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

  const savedKeys = useMemo(() => new Set(saved.map(t => `${t.year}-${t.month}-${t.currency}`)), [saved])

  const fmt = (n: number | string) => Number(n).toLocaleString('es-UY', { maximumFractionDigits: 2 })
  const input = 'w-full bg-slate-800/60 border border-slate-700 rounded-xl px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-emerald-500/50'

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6">
        <h2 className="text-lg font-semibold text-white mb-1">Importar totales mensuales</h2>
        <p className="text-sm text-slate-400 mb-5">
          Traé el total de ingresos y gastos de cada mes de tu app anterior. No se crean comprobantes:
          los meses aparecen en tus gráficos y desde acá seguís registrando día a día.
        </p>

        {accounts.length === 0 && (
          <div className="mb-5 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
            Todavía no tenés cuentas. Los totales se pueden cargar igual y el gráfico de ingresos y gastos
            se ve bien, pero el patrimonio de esos meses se calcula hacia atrás desde tu saldo actual:
            sin cuentas parte de 0 y queda negativo. Creá primero tus cuentas con el saldo que tienen hoy.
          </div>
        )}

        {/* Plantilla de Excel: descargar, completar afuera y subir */}
        <div className="mb-5 rounded-xl border border-slate-700/70 bg-slate-800/30 p-4">
          <div className="flex items-start gap-3">
            <FileSpreadsheet className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-slate-200">Con la plantilla de Excel</p>
              <p className="text-xs text-slate-500 mt-0.5">Ideal para varios meses: completala con calma y subila.</p>
              <div className="flex flex-wrap gap-2 mt-3">
                <a
                  href="/plantilla-totales-mensuales.xlsx"
                  download="Fluxo - Plantilla totales mensuales.xlsx"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-700/70 hover:bg-slate-700 text-xs font-medium text-slate-200"
                >
                  <Download className="w-3.5 h-3.5" /> Descargar plantilla
                </a>
                <button
                  onClick={() => fileRef.current?.click()}
                  disabled={parseMut.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/30 text-xs font-medium text-emerald-300 disabled:opacity-50"
                >
                  {parseMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />}
                  Subir plantilla completada
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".xlsx,.csv"
                  className="hidden"
                  onChange={e => {
                    const f = e.target.files?.[0]
                    if (f) { setResult(null); parseMut.mutate(f) }
                    e.target.value = ''
                  }}
                />
              </div>
              {fileErrors.length > 0 && (
                <div className="mt-2 space-y-0.5">
                  {fileErrors.slice(0, 5).map(fe => (
                    <p key={fe.row} className="text-xs text-rose-400">Fila {fe.row}: {fe.message}</p>
                  ))}
                  {fileErrors.length > 5 && <p className="text-xs text-rose-400">y {fileErrors.length - 5} más…</p>}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="mt-5">
          <label className="block text-sm font-medium text-slate-400 mb-1">O cargá un mes a mano</label>
          <div className="grid grid-cols-2 sm:grid-cols-[1.3fr_0.8fr_1fr_1fr_auto] gap-2">
            <input type="month" value={manual.month} onChange={e => setManual(m => ({ ...m, month: e.target.value }))} className={input} />
            <select value={currency} onChange={e => setCurrency(e.target.value)} className={input} aria-label="Moneda">
              {currencies.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <input inputMode="decimal" placeholder="Ingresos" value={manual.income} onChange={e => setManual(m => ({ ...m, income: e.target.value }))} className={input} />
            <input inputMode="decimal" placeholder="Gastos" value={manual.expense} onChange={e => setManual(m => ({ ...m, expense: e.target.value }))} className={input} />
            <button onClick={addManual} className="col-span-2 sm:col-span-1 flex items-center justify-center gap-1 px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm text-slate-200">
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
                  <span className="text-slate-500 text-xs">
                    {r.currency}
                    {savedKeys.has(`${r.year}-${r.month}-${r.currency}`) && <span className="ml-1.5 text-amber-400">reemplaza</span>}
                  </span>
                  <button onClick={() => setPending(p => p.filter(x => x !== r))} className="text-slate-600 hover:text-slate-300">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
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
