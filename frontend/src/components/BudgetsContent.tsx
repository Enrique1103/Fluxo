import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2, Pencil, Loader2, Target, Copy, ChevronDown, ChevronUp } from 'lucide-react'
import { fetchBudgets, createBudget, updateBudget, deleteBudget, saveBudgetsBulk } from '../api/budgets'
import type { Budget } from '../api/budgets'
import type { BudgetUpdate } from '../api/budgets'
import { fetchCategories, fetchConcepts, kindAllows } from '../api/dashboard'
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

function fmtNum(n: number | string) {
  // La API devuelve los montos decimales como texto ("22000.00")
  return Number(n).toLocaleString('es-UY', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

interface AddFormProps {
  onDone: () => void
  currency: string
  initialMonth: number
  initialYear: number
}

const inputCls = 'w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500/60'

function AddForm({ onDone, currency, initialMonth, initialYear }: AddFormProps) {
  const qc = useQueryClient()
  // For 'category' scope: ordered list of selected category IDs (first = category_id for backend)
  const [selectedCatIds, setSelectedCatIds] = useState<string[]>([])
  // For 'concept' scope: single category to filter concepts
  const [singleCatId,    setSingleCatId]    = useState('')
  const [scope,          setScope]          = useState<'category' | 'concept'>('category')
  const [conceptId,      setConceptId]      = useState('')
  const [budgetName,     setBudgetName]     = useState('')
  const [month,  setMonth]  = useState(initialMonth)
  const [year,   setYear]   = useState(initialYear)
  const [amount, setAmount] = useState('')
  const [cur,    setCur]    = useState(currency)
  const [error,  setError]  = useState<string | null>(null)

  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories })
  const { data: concepts = [] }   = useQuery({ queryKey: ['concepts'],   queryFn: fetchConcepts })

  const expenseCategories = categories.filter(c => !c.is_system && kindAllows(c.kind, 'expense'))
  const categoryConcepts  = concepts
    .filter(c => c.category_id === singleCatId && !c.is_refund)
    .sort((a, b) => a.name.localeCompare(b.name))

  const toggleCat = (id: string) =>
    setSelectedCatIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id])

  // first selected = category_id for backend; rest = extra_category_ids
  const categoryId  = scope === 'category' ? (selectedCatIds[0] ?? '') : singleCatId
  const extraCatIds = scope === 'category' ? selectedCatIds.slice(1) : []

  const isValid = scope === 'concept'
    ? (singleCatId && conceptId && amount)
    : (selectedCatIds.length > 0 && amount)

  const mutation = useMutation({
    mutationFn: () => createBudget({
      category_id: categoryId,
      extra_category_ids: extraCatIds,
      concept_id: scope === 'concept' ? conceptId : null,
      name: scope === 'category' && selectedCatIds.length > 1 ? (budgetName || null) : null,
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
        {/* Scope toggle */}
        <div className="col-span-2">
          <label className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 block">Aplicar a</label>
          <div className="grid grid-cols-2 gap-1 p-1 bg-slate-900 border border-slate-700 rounded-xl">
            {([['category', 'Categoría(s)'], ['concept', 'Un concepto']] as const).map(([v, label]) => (
              <button key={v} type="button"
                onClick={() => { setScope(v); setSelectedCatIds([]); setSingleCatId(''); setConceptId('') }}
                className={`py-1.5 rounded-lg text-xs font-medium transition-colors ${
                  scope === v ? 'bg-indigo-500/25 text-indigo-200' : 'text-slate-500 hover:text-slate-300'
                }`}>
                {label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-slate-500 mt-1">
            {scope === 'category'
              ? 'Un solo límite que suma todo lo que gastes en sus conceptos. Podés sumar varias categorías.'
              : 'Límite solo para ese concepto (ej: Supermercado).'}
          </p>
        </div>

        {/* Category scope: checkbox list (todas con igual importancia) */}
        {scope === 'category' && (
          <div className="col-span-2">
            <label className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 block">
              Categorías <span className="normal-case text-slate-600">(elegí una o más)</span>
            </label>
            <div className="space-y-1 rounded-xl bg-slate-900 border border-slate-700 p-2 max-h-40 overflow-y-auto">
              {expenseCategories.map(c => (
                <label key={c.id} className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer hover:text-slate-100">
                  <input type="checkbox" checked={selectedCatIds.includes(c.id)}
                    onChange={() => toggleCat(c.id)} className="accent-indigo-500" />
                  {c.name}
                </label>
              ))}
            </div>
            {selectedCatIds.length > 1 && (
              <div className="mt-1.5">
                <label className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 block">
                  Nombre del grupo <span className="normal-case text-slate-600">(opcional)</span>
                </label>
                <input type="text" value={budgetName} onChange={e => setBudgetName(e.target.value)}
                  placeholder={selectedCatIds.map(id => expenseCategories.find(c => c.id === id)?.name ?? '').join(' + ')}
                  maxLength={60} className={inputCls} />
              </div>
            )}
          </div>
        )}

        {/* Concept scope: single category dropdown + concept dropdown */}
        {scope === 'concept' && (
          <>
            <div className="col-span-2">
              <label className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 block">Categoría</label>
              <select value={singleCatId}
                onChange={e => { setSingleCatId(e.target.value); setConceptId('') }}
                className={inputCls}>
                <option value="">Seleccioná una categoría</option>
                {expenseCategories.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 block">Concepto</label>
              <select value={conceptId} onChange={e => setConceptId(e.target.value)}
                disabled={!singleCatId} className={`${inputCls} disabled:opacity-50`}>
                <option value="">{singleCatId ? 'Seleccioná un concepto' : 'Elegí primero la categoría'}</option>
                {categoryConcepts.map(c => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
          </>
        )}

        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 block">Mes</label>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500/60">
            {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 block">Año</label>
          <input type="number" value={year} onChange={e => setYear(Number(e.target.value))} min={2000}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500/60" />
        </div>
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 block">Límite</label>
          <input type="number" value={amount} onChange={e => setAmount(e.target.value)}
            placeholder="0" min={1}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500/60" />
        </div>
        <div>
          <label className="text-[10px] text-slate-500 uppercase tracking-widest mb-1 block">Moneda</label>
          <select value={cur} onChange={e => setCur(e.target.value)}
            className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 outline-none focus:border-indigo-500/60">
            <option value="UYU">UYU</option>
            <option value="USD">USD</option>
          </select>
        </div>
      </div>

      {error && <p className="text-[10px] text-rose-400">{error}</p>}

      <div className="flex gap-2">
        <button onClick={onDone}
          className="flex-1 py-2 rounded-xl text-xs font-medium border border-slate-700 text-slate-500 hover:bg-slate-800">
          Cancelar
        </button>
        <button onClick={() => { setError(null); mutation.mutate() }}
          disabled={mutation.isPending || !isValid}
          className="flex-1 py-2 rounded-xl text-xs font-semibold bg-emerald-500 text-slate-900 hover:bg-emerald-400 disabled:opacity-50 flex items-center justify-center gap-1">
          {mutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Plus className="w-3 h-3" />}
          Guardar
        </button>
      </div>
    </div>
  )
}

function BudgetRow({ budget, nested = false }: { budget: Budget; nested?: boolean }) {
  const qc = useQueryClient()
  const [editing,       setEditing]       = useState(false)
  const [expanded,      setExpanded]      = useState(false)
  const [amount,        setAmount]        = useState(String(Number(budget.max_amount)))
  const [editCatIds,    setEditCatIds]    = useState<string[]>([budget.category_id, ...budget.extra_category_ids])
  const [editName,      setEditName]      = useState(budget.name ?? '')
  const isMultiCat = !budget.concept_id && (budget.extra_category_ids?.length ?? 0) > 0

  const { data: categories = [] } = useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    enabled: editing && !budget.concept_id,
  })
  const expenseCats = categories.filter(c => !c.is_system && kindAllows(c.kind, 'expense'))
  const toggleEditCat = (id: string) =>
    setEditCatIds(prev => prev.includes(id) ? (prev.length > 1 ? prev.filter(x => x !== id) : prev) : [...prev, id])

  const pct = budget.max_amount > 0 ? Math.min((budget.spent / budget.max_amount) * 100, 100) : 0

  const updateMut = useMutation({
    mutationFn: () => {
      const payload: BudgetUpdate = { max_amount: parseFloat(amount) }
      if (!budget.concept_id && editCatIds.length > 0) {
        payload.category_id = editCatIds[0]
        payload.extra_category_ids = editCatIds.slice(1)
        payload.name = editCatIds.length > 1 ? (editName.trim() || null) : null
      }
      return updateBudget(budget.id, payload)
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['budgets'] }); setEditing(false) },
  })

  const deleteMut = useMutation({
    mutationFn: () => deleteBudget(budget.id),
    onSuccess:  () => qc.invalidateQueries({ queryKey: ['budgets'] }),
  })

  return (
    <div className={`py-3 border-b border-slate-800/50 last:border-b-0 ${nested ? 'pl-8 pr-4' : 'px-4'}`}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="min-w-0">
          <p className={`font-medium truncate ${nested ? 'text-xs text-slate-300' : 'text-sm text-slate-200'}`}>
            {budget.concept_name ?? budget.name ?? budgetDisplayName(budget)}
          </p>
          <p className="text-[10px] text-slate-500">
            {budget.concept_id
              ? `Concepto · ${budget.category_name}`
              : (isMultiCat
                  ? `${1 + budget.extra_category_ids.length} categorías`
                  : 'Toda la categoría')
            } · {budget.currency}
          </p>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {isMultiCat && (
            <button
              onClick={() => setExpanded(e => !e)}
              title="Ver categorías"
              className="p-1.5 rounded-lg text-slate-600 hover:text-slate-300 hover:bg-slate-800 transition-colors"
            >
              {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>
          )}
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

      {isMultiCat && expanded && (
        <div className="mb-2 flex flex-wrap gap-1">
          {[budget.category_name, ...budget.extra_category_names].map(name => (
            <span key={name} className="px-2 py-0.5 rounded-full bg-slate-800 text-[10px] text-slate-400 border border-slate-700">
              {name}
            </span>
          ))}
        </div>
      )}

      {editing ? (
        <div className="mb-2 space-y-2">
          {!budget.concept_id && (
            <div className="bg-slate-900/60 border border-slate-700/60 rounded-xl p-2.5">
              <p className="text-[10px] text-slate-500 mb-1.5">Categorías</p>
              <div className="flex flex-wrap gap-1">
                {expenseCats.map(cat => {
                  const checked = editCatIds.includes(cat.id)
                  return (
                    <button
                      key={cat.id}
                      onClick={() => toggleEditCat(cat.id)}
                      className={`px-2 py-0.5 rounded-full text-[10px] border transition-colors ${
                        checked
                          ? 'bg-indigo-500/20 border-indigo-500/60 text-indigo-300'
                          : 'bg-slate-800 border-slate-700 text-slate-400 hover:border-slate-500'
                      }`}
                    >
                      {cat.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
          {!budget.concept_id && editCatIds.length > 1 && (
            <input
              type="text"
              value={editName}
              onChange={e => setEditName(e.target.value)}
              placeholder="Nombre del presupuesto (opcional)"
              className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 outline-none focus:border-indigo-500/60 placeholder:text-slate-600"
            />
          )}
          <div className="flex gap-2">
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

interface DraftRow {
  key: string
  category_id: string
  extra_category_ids: string[]
  concept_id: string | null
  name: string | null
  label: string
  sub: string
  currency: string
  spent: number
  amount: string
  include: boolean
  exists: boolean
}

function prevPeriod(month: number, year: number) {
  return month === 1 ? { month: 12, year: year - 1 } : { month: month - 1, year }
}

/** Copia los presupuestos de un mes al mes que se está viendo. Se pueden ajustar antes de guardar. */
function CopyPanel({ month, year, existing, onDone }: {
  month: number; year: number; existing: Budget[]; onDone: () => void
}) {
  const qc = useQueryClient()
  const prev = prevPeriod(month, year)
  const [fromMonth, setFromMonth] = useState(prev.month)
  const [fromYear,  setFromYear]  = useState(prev.year)
  const [edits,     setEdits]     = useState<Record<string, { amount?: string; include?: boolean }>>({})
  const [error,     setError]     = useState<string | null>(null)
  const sameMonth = fromMonth === month && fromYear === year

  const { data: source = [], isLoading } = useQuery({
    queryKey: ['budgets', fromMonth, fromYear],
    queryFn:  () => fetchBudgets({ month: fromMonth, year: fromYear }),
    enabled:  !sameMonth,
  })

  const budgetKey = (b: Budget | DraftRow) => {
    const catKey = b.concept_id
      ? `con:${b.concept_id}`
      : `cats:${[b.category_id, ...(b.extra_category_ids ?? [])].sort().join(',')}`
    return `${catKey}|${b.currency}`
  }

  const existingKeys = useMemo(
    () => new Set(existing.map(budgetKey)),
    [existing],
  )

  const rows: DraftRow[] = useMemo(() => sortBudgets(source).map(b => {
    const key = budgetKey(b)
    const e = edits[key] ?? {}
    return {
      key,
      category_id: b.category_id,
      extra_category_ids: b.extra_category_ids ?? [],
      concept_id:  b.concept_id,
      name: b.name,
      label:  b.concept_name ?? b.name ?? budgetDisplayName(b),
      sub:    b.concept_id ? 'Concepto' : (b.extra_category_ids?.length > 0 ? `${1 + b.extra_category_ids.length} categorías` : 'Toda la categoría'),
      currency: b.currency,
      spent:  Number(b.spent),
      amount: e.amount ?? String(Number(b.max_amount)),
      include: e.include ?? true,
      exists: existingKeys.has(key),
    }
  }), [source, edits, existingKeys])

  const setRow = (key: string, patch: { amount?: string; include?: boolean }) =>
    setEdits(prevEdits => ({ ...prevEdits, [key]: { ...prevEdits[key], ...patch } }))

  const chosen  = rows.filter(r => r.include)
  const invalid = chosen.some(r => !(parseFloat(r.amount) > 0))
  const overwrites = chosen.filter(r => r.exists).length

  const mutation = useMutation({
    mutationFn: () => saveBudgetsBulk(month, year, chosen.map(r => ({
      category_id: r.category_id,
      extra_category_ids: r.extra_category_ids,
      concept_id:  r.concept_id,
      name: r.name,
      max_amount:  parseFloat(r.amount),
      currency:    r.currency,
    }))),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['budgets'] }); onDone() },
    onError:   (err: any) => setError(err?.response?.data?.detail ?? 'No se pudo guardar la copia'),
  })

  const thisYear = new Date().getFullYear()

  return (
    <div className="bg-slate-800/60 border border-indigo-500/30 rounded-2xl p-4 space-y-3">
      <div>
        <p className="text-xs font-semibold text-slate-200">Copiar presupuestos a {MONTHS[month - 1]} {year}</p>
        <p className="text-[10px] text-slate-500 mt-0.5">Ajustá los montos antes de guardar. Nada se guarda hasta que confirmes.</p>
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500 uppercase tracking-widest shrink-0">Desde</span>
        <select value={fromMonth} onChange={e => { setFromMonth(Number(e.target.value)); setEdits({}) }}
          className="flex-1 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-300 outline-none">
          {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>
        <select value={fromYear} onChange={e => { setFromYear(Number(e.target.value)); setEdits({}) }}
          className="w-24 bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-300 outline-none">
          {[thisYear - 2, thisYear - 1, thisYear, thisYear + 1].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      <div className="rounded-xl border border-slate-700/60 bg-slate-900 max-h-[50vh] overflow-y-auto">
        {sameMonth ? (
          <p className="py-6 text-center text-xs text-slate-500">Elegí un mes distinto al que estás viendo.</p>
        ) : isLoading ? (
          <div className="flex justify-center py-6"><Loader2 className="w-4 h-4 animate-spin text-slate-600" /></div>
        ) : rows.length === 0 ? (
          <p className="py-6 text-center text-xs text-slate-500">{MONTHS[fromMonth - 1]} {fromYear} no tiene presupuestos.</p>
        ) : rows.map(r => (
          <div key={r.key} className={`flex items-center gap-2 px-3 py-2 border-b border-slate-800/60 last:border-b-0 ${r.include ? '' : 'opacity-40'}`}>
            <input type="checkbox" checked={r.include} onChange={e => setRow(r.key, { include: e.target.checked })}
              className="accent-indigo-500 shrink-0" aria-label={`Incluir ${r.label}`} />
            <div className={`min-w-0 flex-1 ${r.concept_id ? 'pl-3' : ''}`}>
              <p className="text-xs text-slate-200 truncate">{r.label}</p>
              <p className="text-[10px] text-slate-500">
                {r.sub}
                {' · '}
                <button type="button" onClick={() => setRow(r.key, { amount: String(Math.ceil(r.spent)) })}
                  disabled={!r.include || r.spent <= 0}
                  className="underline decoration-dotted hover:text-indigo-300 disabled:no-underline disabled:hover:text-slate-500"
                  title="Usar lo que gastaste como nuevo límite">
                  gastaste {fmtNum(r.spent)}
                </button>
                {r.exists && <span className="text-amber-400/80"> · reemplaza el actual</span>}
              </p>
            </div>
            <input type="number" inputMode="decimal" value={r.amount} min={1} disabled={!r.include}
              onChange={e => setRow(r.key, { amount: e.target.value })}
              className="w-24 bg-slate-800 border border-slate-700 rounded-lg px-2 py-1 text-xs text-right text-slate-200 tabular-nums outline-none focus:border-indigo-500/60"
              aria-label={`Monto ${r.label}`} />
            <span className="text-[10px] text-slate-500 w-7 shrink-0">{r.currency}</span>
          </div>
        ))}
      </div>

      {overwrites > 0 && (
        <p className="text-[10px] text-amber-400/90">
          {overwrites === 1 ? '1 presupuesto ya existe' : `${overwrites} presupuestos ya existen`} en {MONTHS[month - 1]}: se actualiza el monto.
        </p>
      )}
      {error && <p className="text-[10px] text-rose-400">{error}</p>}

      <div className="flex gap-2">
        <button onClick={onDone}
          className="flex-1 py-2 rounded-xl text-xs font-medium border border-slate-700 text-slate-500 hover:bg-slate-800">
          Cancelar
        </button>
        <button onClick={() => { setError(null); mutation.mutate() }}
          disabled={mutation.isPending || chosen.length === 0 || invalid || sameMonth}
          className="flex-1 py-2 rounded-xl text-xs font-semibold bg-indigo-500 text-white hover:bg-indigo-400 disabled:opacity-50 flex items-center justify-center gap-1">
          {mutation.isPending ? <Loader2 className="w-3 h-3 animate-spin" /> : <Copy className="w-3 h-3" />}
          Guardar {chosen.length > 0 ? chosen.length : ''}
        </button>
      </div>
    </div>
  )
}

function budgetDisplayName(b: Budget): string {
  const names = [b.category_name, ...b.extra_category_names]
  return names.join(' + ')
}

/** Orden: por categoría; primero el presupuesto de la categoría y debajo los de sus conceptos */
function sortBudgets(list: Budget[]): Budget[] {
  return [...list].sort((a, b) =>
    a.category_name.localeCompare(b.category_name)
    || (a.concept_id ? 1 : 0) - (b.concept_id ? 1 : 0)
    || (a.concept_name ?? '').localeCompare(b.concept_name ?? '')
    || a.currency.localeCompare(b.currency))
}

function groupByCategory(list: Budget[]) {
  const groups: { categoryId: string; name: string; items: Budget[] }[] = []
  for (const b of sortBudgets(list)) {
    let g = groups.find(x => x.categoryId === b.category_id)
    if (!g) { g = { categoryId: b.category_id, name: b.category_name, items: [] }; groups.push(g) }
    g.items.push(b)
  }
  return groups
}

export default function BudgetsContent() {
  const today    = new Date()
  const currency = useHomeCurrency()
  const [adding,    setAdding]    = useState(false)
  const [copying,   setCopying]   = useState(false)
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
          <p className="text-xs text-slate-500 mt-0.5">Por categoría o por concepto</p>
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => { setCopying(true); setAdding(false) }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-500/15 hover:bg-indigo-500/25 text-indigo-300 text-xs font-medium rounded-xl transition-colors"
            title="Copiar los presupuestos de otro mes a este"
          >
            <Copy className="w-3.5 h-3.5" />
            <span className="whitespace-nowrap">Copiar mes</span>
          </button>
          <button
            onClick={() => { setAdding(true); setCopying(false) }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-medium rounded-xl transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            Nuevo
          </button>
        </div>
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

      {adding && (
        <AddForm onDone={() => setAdding(false)} currency={currency} initialMonth={showMonth} initialYear={showYear} />
      )}
      {copying && (
        <CopyPanel key={`${showMonth}-${showYear}`} month={showMonth} year={showYear} existing={budgets}
          onDone={() => setCopying(false)} />
      )}

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
            {!copying && (
              <button onClick={() => setCopying(true)} className="mt-2 text-xs text-indigo-300 hover:text-indigo-200 underline">
                Copiar del mes anterior
              </button>
            )}
          </div>
        ) : (
          groupByCategory(budgets).map(g => (
            <div key={g.categoryId} className="border-b border-slate-800 last:border-b-0">
              {g.items[0].concept_id && (
                <p className="px-4 pt-3 text-sm font-medium text-slate-200">
                  {g.name} <span className="text-[10px] font-normal text-slate-500">· sin límite general</span>
                </p>
              )}
              {g.items.map(b => <BudgetRow key={b.id} budget={b} nested={!!b.concept_id} />)}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
