import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Pencil, Loader2, Target } from 'lucide-react'
import { fetchBudgets, createBudget, updateBudget, deleteBudget } from '../api/budgets'
import type { Budget } from '../api/budgets'
import { fetchCategories } from '../api/dashboard'
import { useHomeCurrency } from '../hooks/useHomeCurrency'

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function pctColor(pct: number) {
  if (pct >= 100) return 'text-red-400'
  if (pct >= 80)  return 'text-amber-400'
  return 'text-emerald-400'
}

function barColor(pct: number) {
  if (pct >= 100) return 'bg-red-500'
  if (pct >= 80)  return 'bg-amber-500'
  return 'bg-emerald-500'
}

function fmtNum(n: number) {
  return n.toLocaleString('es-UY', { minimumFractionDigits: 0, maximumFractionDigits: 0 })
}

interface AddFormProps {
  onDone: () => void
  currency: string
}

function AddForm({ onDone, currency }: AddFormProps) {
  const qc = useQueryClient()
  const today = new Date()
  const [categoryId, setCategoryId] = useState('')
  const [month,      setMonth]      = useState(today.getMonth() + 1)
  const [year,       setYear]       = useState(today.getFullYear())
  const [amount,     setAmount]     = useState('')
  const [cur,        setCur]        = useState(currency)
  const [error,      setError]      = useState<string | null>(null)

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories })

  const mutation = useMutation({
    mutationFn: () => createBudget({
      category_id: categoryId,
      month, year,
      max_amount: parseFloat(amount),
      currency: cur,
    }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['budgets'] })
      onDone()
    },
    onError: (err: any) => {
      setError(err?.response?.data?.detail ?? 'Error al crear presupuesto')
    },
  })

  return (
    <div className="bg-slate-800/60 border border-slate-700/50 rounded-2xl p-4 space-y-3">
      <p className="text-xs font-semibold text-slate-300">Nuevo presupuesto</p>

      <div className="grid grid-cols-2 gap-2">
        <div className="col-span-2">
          <label className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 block">Categoría</label>
          <select
            value={categoryId}
            onChange={e => setCategoryId(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500/60"
          >
            <option value="">Seleccioná una categoría</option>
            {categories.filter(c => !c.is_system).map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 block">Mes</label>
          <select
            value={month}
            onChange={e => setMonth(Number(e.target.value))}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500/60"
          >
            {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>

        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 block">Año</label>
          <input
            type="number"
            value={year}
            onChange={e => setYear(Number(e.target.value))}
            min={2000}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500/60"
          />
        </div>

        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 block">Límite</label>
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            placeholder="0"
            min={1}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500/60"
          />
        </div>

        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 block">Moneda</label>
          <select
            value={cur}
            onChange={e => setCur(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500/60"
          >
            <option value="UYU">UYU</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>

      {error && <p className="text-[10px] text-rose-400">{error}</p>}

      <div className="flex gap-2">
        <button
          onClick={onDone}
          className="flex-1 py-2 rounded-xl text-xs font-medium border border-slate-700 text-slate-500 hover:bg-slate-800"
        >
          Cancelar
        </button>
        <button
          onClick={() => { setError(null); mutation.mutate() }}
          disabled={mutation.isPending || !categoryId || !amount}
          className="flex-1 py-2 rounded-xl text-xs font-semibold bg-emerald-500 text-slate-900 hover:bg-emerald-400 disabled:opacity-50 flex items-center justify-center gap-1"
        >
          {mutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Guardar
        </button>
      </div>
    </div>
  )
}

function BudgetRow({ budget }: { budget: Budget }) {
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const [amount, setAmount]   = useState(String(budget.max_amount))

  const pct = budget.max_amount > 0 ? Math.min((budget.spent / budget.max_amount) * 100, 100) : 0

  const updateMut = useMutation({
    mutationFn: () => updateBudget(budget.id, parseFloat(amount)),
    onSuccess:  () => { qc.invalidateQueries({ queryKey: ['budgets'] }); setEditing(false) },
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteBudget(budget.id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  })

  return (
    <div className="px-4 py-3 border-b border-slate-800/50 last:border-b-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-200 truncate">{budget.category_name}</p>
          <p className="text-[10px] text-slate-500">{MONTHS[budget.month - 1]} {budget.year} · {budget.currency}</p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button
            onClick={() => setEditing(e => !e)}
            className="p-1.5 rounded-lg text-slate-600 hover:text-indigo-400 hover:bg-indigo-500/10 transition-colors"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={() => deleteMut.mutate()}
            disabled={deleteMut.isPending}
            className="p-1.5 rounded-lg text-slate-600 hover:text-rose-400 hover:bg-rose-500/10 transition-colors disabled:opacity-50"
          >
            {deleteMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Trash2 className="w-3 h-3" />}
          </button>
        </div>
      </div>

      {editing ? (
        <div className="flex gap-2 mb-2">
          <input
            type="number"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500/60"
          />
          <button
            onClick={() => updateMut.mutate()}
            disabled={updateMut.isPending}
            className="px-3 py-1.5 rounded-xl text-xs font-semibold bg-indigo-500 text-white hover:bg-indigo-400 disabled:opacity-50"
          >
            {updateMut.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Guardar'}
          </button>
        </div>
      ) : null}

      <div className="flex items-center gap-2">
        <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-700 ${barColor(pct)}`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className={`text-[10px] font-semibold tabular-nums shrink-0 ${pctColor(pct)}`}>
          {pct.toFixed(0)}%
        </span>
        <span className="text-[10px] text-slate-500 shrink-0 tabular-nums">
          {fmtNum(budget.spent)} / {fmtNum(budget.max_amount)}
        </span>
      </div>
    </div>
  )
}

export default function BudgetsContent() {
  const today    = new Date()
  const currency = useHomeCurrency()
  const [adding,    setAdding]    = useState(false)
  const [showMonth, setShowMonth] = useState(today.getMonth() + 1)
  const [showYear,  setShowYear]  = useState(today.getFullYear())

  const { data: budgets = [], isLoading } = useQuery({
    queryKey: ['budgets', showMonth, showYear],
    queryFn:  () => fetchBudgets({ month: showMonth, year: showYear }),
  })

  return (
    <div className="px-6 py-6 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-base font-semibold text-white">Presupuestos</h2>
          <p className="text-xs text-slate-500 mt-0.5">Límite de gasto por categoría</p>
        </div>
        <button
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-medium rounded-xl transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Nuevo
        </button>
      </div>

      {/* Period picker */}
      <div className="flex items-center gap-2">
        <select
          value={showMonth}
          onChange={e => setShowMonth(Number(e.target.value))}
          className="flex-1 bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-300 outline-none"
        >
          {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>
        <select
          value={showYear}
          onChange={e => setShowYear(Number(e.target.value))}
          className="w-24 bg-slate-800 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-300 outline-none"
        >
          {[today.getFullYear() - 1, today.getFullYear(), today.getFullYear() + 1].map(y => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>

      {adding && <AddForm onDone={() => setAdding(false)} currency={currency} />}

      {/* List */}
      <div className="rounded-2xl border border-slate-800 overflow-hidden bg-slate-900">
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin text-slate-600" />
          </div>
        ) : budgets.length === 0 ? (
          <div className="py-8 text-center">
            <Target className="w-5 h-5 text-slate-700 mx-auto mb-2" />
            <p className="text-xs text-slate-600">Sin presupuestos para este período</p>
          </div>
        ) : (
          budgets.map(b => <BudgetRow key={b.id} budget={b} />)
        )}
      </div>
    </div>
  )
}
