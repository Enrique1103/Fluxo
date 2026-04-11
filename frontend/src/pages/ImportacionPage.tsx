import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { invalidateFinancialData } from '../lib/queryClient'
import { useNavigate } from 'react-router-dom'
import useTheme from '../hooks/useTheme'
import {
  Upload, ArrowLeft, CheckCircle2, AlertCircle, Activity, BarChart2,
  Clock, FileSpreadsheet, ChevronRight, Loader2, X, Home,
  TriangleAlert, Wand2,
} from 'lucide-react'
import {
  parsearArchivo,
  confirmarImportacion,
  fetchHistorialImportaciones,
  detectarBanco,
  type MovimientoImportado,
  type ParsearResponse,
  type DuplicateDetail,
  type CuentaDetectada,
} from '../api/importacion'
import {
  fetchAccounts,
  fetchCategories,
  fetchConcepts,
  type Account,
  type Category,
  type Concept,
} from '../api/dashboard'
import { fetchHouseholds, type Household } from '../api/households'

// ─── tipos ──────────────────────────────────────────────────────────────────

const METODOS_PAGO = [
  { value: 'efectivo',              label: 'Efectivo' },
  { value: 'tarjeta_debito',        label: 'Tarjeta débito' },
  { value: 'tarjeta_credito',       label: 'Tarjeta crédito' },
  { value: 'transferencia_bancaria',label: 'Transferencia' },
  { value: 'billetera_digital',     label: 'Billetera digital' },
  { value: 'otro',                  label: 'Otro' },
]

interface RowEdit {
  concepto: string        // nombre del concepto elegido o creado
  esNuevo: boolean        // true = el usuario está escribiendo un nombre nuevo
  categoria: string       // nombre de la categoría elegida o creada
  esNuevaCategoria: boolean
  metodo_pago: string
  householdId: string     // '' = no es gasto del hogar
  transferDestAccountId: string  // para transferencias Zcuentas: cuenta destino Fluxo ('' = registrar como gasto)
}

// ─── helpers ────────────────────────────────────────────────────────────────

function estadoBadge(estado: string, isLight = false) {
  if (isLight) {
    switch (estado) {
      case 'validado':  return 'bg-teal-50 text-teal-600 font-medium border-teal-100'
      case 'duplicado': return 'bg-amber-50 text-amber-600 border-amber-100'
      case 'error':     return 'bg-rose-50 text-rose-600 border-rose-100'
      case 'completed': return 'bg-teal-50 text-teal-600 font-medium border-teal-100'
      case 'partial':   return 'bg-amber-50 text-amber-600 border-amber-100'
      default:          return 'bg-slate-100 text-slate-500 border-slate-200'
    }
  }
  switch (estado) {
    case 'validado':  return 'bg-emerald-500/10 text-emerald-400'
    case 'duplicado': return 'bg-amber-500/10 text-amber-400'
    case 'error':     return 'bg-rose-500/10 text-rose-400'
    case 'completed': return 'bg-emerald-500/10 text-emerald-400'
    case 'partial':   return 'bg-amber-500/10 text-amber-400'
    default:          return 'bg-slate-500/10 text-slate-400'
  }
}

function fmtFecha(iso: string) { return iso.slice(0, 10) }

// ─── ConceptoCell ────────────────────────────────────────────────────────────

function ConceptoCell({
  edit, concepts, onChange, isLight,
}: {
  edit: RowEdit; concepts: Concept[]
  onChange: (partial: Partial<RowEdit>) => void; isLight: boolean
}) {
  const base = isLight
    ? 'bg-white border-slate-200 text-slate-800 placeholder-slate-400'
    : 'bg-slate-900 border-slate-700 text-slate-200'
  const focus = isLight
    ? 'focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20'
    : 'focus:border-teal-500 focus:ring-1 focus:ring-teal-400/30'
  const cls = `border rounded-lg px-2 py-1 text-sm outline-none transition-colors ${focus} ${base}`

  if (edit.esNuevo) {
    return (
      <div className="flex items-center gap-1 min-w-[160px]">
        <input
          autoFocus
          value={edit.concepto}
          onChange={e => onChange({ concepto: e.target.value })}
          placeholder="Nombre del concepto"
          className={`flex-1 min-w-0 ${cls}`}
        />
        <button
          onClick={() => onChange({ esNuevo: false, concepto: '' })}
          className={`shrink-0 ${isLight ? 'text-slate-400 hover:text-slate-700' : 'text-slate-500 hover:text-slate-300'}`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <select
      value={edit.concepto}
      onChange={e => {
        if (e.target.value === '__nuevo__') onChange({ esNuevo: true, concepto: '' })
        else onChange({ concepto: e.target.value })
      }}
      className={`w-full appearance-none cursor-pointer min-w-[160px] ${cls}`}
    >
      <option value="">Seleccionar concepto…</option>
      {concepts.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
      <option value="__nuevo__">➕ Crear nuevo…</option>
    </select>
  )
}

// ─── CategoriaCell ───────────────────────────────────────────────────────────

function CategoriaCell({
  edit, categories, onChange, isLight,
}: {
  edit: RowEdit; categories: Category[]
  onChange: (partial: Partial<RowEdit>) => void; isLight: boolean
}) {
  const base = isLight
    ? 'bg-white border-slate-200 text-slate-800'
    : 'bg-slate-900 border-slate-700 text-slate-200'
  const focus = isLight
    ? 'focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20'
    : 'focus:border-teal-500 focus:ring-1 focus:ring-teal-400/30'
  const cls = `border rounded-lg px-2 py-1 text-sm outline-none transition-colors ${focus} ${base}`

  if (edit.esNuevaCategoria) {
    return (
      <div className="flex items-center gap-1 min-w-[140px]">
        <input
          autoFocus
          value={edit.categoria}
          onChange={e => onChange({ categoria: e.target.value })}
          placeholder="Nombre de categoría"
          className={`flex-1 min-w-0 ${cls}`}
        />
        <button
          onClick={() => onChange({ esNuevaCategoria: false, categoria: '' })}
          className={`shrink-0 ${isLight ? 'text-slate-400 hover:text-slate-700' : 'text-slate-500 hover:text-slate-300'}`}
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>
    )
  }

  return (
    <select
      value={edit.categoria}
      onChange={e => {
        if (e.target.value === '__nueva__') onChange({ esNuevaCategoria: true, categoria: '' })
        else onChange({ categoria: e.target.value })
      }}
      className={`w-full appearance-none cursor-pointer min-w-[140px] ${cls}`}
    >
      <option value="">Sin clasificar</option>
      {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
      <option value="__nueva__">➕ Crear nueva…</option>
    </select>
  )
}

// ─── MetodoPagoCell ──────────────────────────────────────────────────────────

function MetodoPagoCell({
  value, onChange, isLight,
}: {
  value: string; onChange: (v: string) => void; isLight: boolean
}) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value)}
      className={`w-full border rounded-lg px-2 py-1 text-sm outline-none appearance-none cursor-pointer min-w-[130px] transition-colors ${
        isLight
          ? 'bg-white border-slate-200 text-slate-800 focus:border-teal-400 focus:ring-2 focus:ring-teal-400/20'
          : 'bg-slate-900 border-slate-700 text-slate-200 focus:border-teal-500 focus:ring-1 focus:ring-teal-400/30'
      }`}
    >
      {METODOS_PAGO.map(m => (
        <option key={m.value} value={m.value}>{m.label}</option>
      ))}
    </select>
  )
}

// ─── HogarCell ───────────────────────────────────────────────────────────────

function HogarCell({
  value,
  households,
  onChange,
}: {
  value: string
  households: Household[]
  onChange: (id: string) => void
}) {
  const isOn = value !== ''
  const noHouseholds = households.length === 0

  return (
    <div className="flex items-center gap-1.5">
      <button
        type="button"
        title={noHouseholds ? 'Primero creá un hogar' : isOn ? 'Quitar del hogar' : 'Marcar como gasto del hogar'}
        onClick={() => !noHouseholds && onChange(isOn ? '' : households[0].id)}
        className={`flex items-center gap-1 px-2 py-1 rounded-lg border transition-all ${
          noHouseholds
            ? 'bg-slate-800/40 border-slate-800 text-slate-700 cursor-not-allowed'
            : isOn
              ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-400'
              : 'bg-slate-800 border-slate-700 text-slate-600 hover:text-slate-400'
        }`}
      >
        <Home className="w-3.5 h-3.5 shrink-0" />
        <span className={`relative inline-flex h-3.5 w-6 items-center rounded-full transition-colors ${isOn && !noHouseholds ? 'bg-indigo-500' : 'bg-slate-600'}`}>
          <span className={`inline-block h-2.5 w-2.5 transform rounded-full bg-white shadow transition-transform ${isOn && !noHouseholds ? 'translate-x-3' : 'translate-x-0.5'}`} />
        </span>
      </button>
      {isOn && households.length > 1 && (
        <select
          value={value}
          onChange={e => onChange(e.target.value)}
          onClick={e => e.stopPropagation()}
          className="bg-slate-900 border border-indigo-500/40 rounded-lg px-1.5 py-0.5 text-xs text-indigo-300 outline-none appearance-none cursor-pointer max-w-[100px]"
        >
          {households.map(h => (
            <option key={h.id} value={h.id}>{h.name}</option>
          ))}
        </select>
      )}
    </div>
  )
}

// ─── DuplicateDetailModal ─────────────────────────────────────────────────────

function DuplicateDetailModal({
  items,
  onClose,
}: {
  items: { mov: MovimientoImportado; detail: DuplicateDetail }[]
  onClose: () => void
}) {
  const CompareRow = ({ label, existing, incoming }: { label: string; existing: string; incoming: string }) => {
    const diff = existing !== incoming
    return (
      <tr className={diff ? 'bg-amber-500/5' : ''}>
        <td className="py-2 pr-3 text-xs text-slate-500 font-medium whitespace-nowrap">{label}</td>
        <td className={`py-2 pr-4 text-sm ${diff ? 'text-amber-300' : 'text-slate-300'}`}>{existing || '—'}</td>
        <td className={`py-2 text-sm ${diff ? 'text-amber-300' : 'text-slate-300'}`}>{incoming || '—'}</td>
      </tr>
    )
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl flex flex-col max-h-[85vh]">
        {/* header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <TriangleAlert className="w-5 h-5 text-amber-400 shrink-0" />
            <div>
              <h3 className="text-sm font-semibold text-white">
                {items.length === 1 ? 'Movimiento duplicado' : `${items.length} movimientos duplicados`}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">Comparación con los registros existentes</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1 text-slate-500 hover:text-white transition-colors rounded-lg hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* scrollable body */}
        <div className="overflow-y-auto flex-1 px-5 py-3 space-y-5">
          {items.map(({ mov, detail }, idx) => {
            const isExact = mov.estado === 'duplicado'
            const incomingMonto = `${mov.monto < 0 ? '-' : '+'}${Math.abs(mov.monto).toLocaleString('es-UY')} ${mov.moneda}`
            const existingMonto = `${detail.monto < 0 ? '-' : '+'}${Math.abs(detail.monto).toLocaleString('es-UY')}`
            return (
              <div key={idx} className={idx > 0 ? 'pt-4 border-t border-slate-800/60' : ''}>
                <div className="flex items-center gap-2 mb-3">
                  <span className={`text-xs px-2 py-0.5 rounded-full ${isExact ? 'bg-amber-500/10 text-amber-400' : 'bg-slate-700/50 text-slate-400'}`}>
                    {isExact ? 'Duplicado exacto' : 'Posible duplicado'}
                  </span>
                  {mov.descripcion && (
                    <span className="text-xs text-slate-500 truncate">{mov.descripcion}</span>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[320px]">
                    <thead>
                      <tr>
                        <th className="pb-1.5 text-left text-xs text-slate-600 font-medium w-20"></th>
                        <th className="pb-1.5 text-left text-xs text-slate-500 font-semibold uppercase tracking-wider">Registrado</th>
                        <th className="pb-1.5 text-left text-xs text-slate-500 font-semibold uppercase tracking-wider">Nuevo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800/40">
                      <CompareRow label="Fecha"       existing={detail.fecha}              incoming={mov.fecha} />
                      <CompareRow label="Monto"       existing={existingMonto}             incoming={incomingMonto} />
                      <CompareRow label="Concepto"    existing={detail.concepto ?? '—'}    incoming={mov.concepto ?? '—'} />
                      <CompareRow label="Categoría"   existing={detail.categoria ?? '—'}   incoming={mov.categoria ?? '—'} />
                      <CompareRow label="Descripción" existing={detail.descripcion ?? '—'} incoming={mov.descripcion ?? '—'} />
                    </tbody>
                  </table>
                </div>
              </div>
            )
          })}
        </div>

        {/* footer */}
        <div className="px-5 py-3 border-t border-slate-800">
          <p className="text-xs text-slate-500">
            Desactivá el checkbox de los movimientos que no querés importar.
          </p>
        </div>
      </div>
    </div>
  )
}

// ─── Component ───────────────────────────────────────────────────────────────

type Step = 'select' | 'mapeo' | 'review' | 'done'

const BANCO_LABELS: Record<string, string> = {
  prex: 'Prex', brou: 'BROU', itau: 'Itaú', santander: 'Santander',
  oca: 'OCA', mercadopago: 'Mercado Pago', uala: 'Uala',
  midinero: 'Midinero', scotiabank: 'Scotiabank', zcuentas: 'Zcuentas',
}

export default function ImportacionPage() {
  const navigate = useNavigate()
  const { theme } = useTheme()
  const isLight = theme === 'light'
  const qc = useQueryClient()
  const fileRef = useRef<HTMLInputElement>(null)

  const [step, setStep]           = useState<Step>('select')
  const [banco, setBanco]         = useState('')
  const [cuentaId, setCuentaId]   = useState('')
  const [archivo, setArchivo]     = useState<File | null>(null)
  const [parseResult, setParseResult]   = useState<ParsearResponse | null>(null)
  const [seleccionados, setSeleccionados] = useState<Set<number>>(new Set())
  const [rowEdits, setRowEdits]   = useState<Record<number, RowEdit>>({})
  const [doneResult,       setDoneResult]       = useState<{ importados: number; descartados: number } | null>(null)
  const [highlightMissing, setHighlightMissing] = useState(false)

  // Detección automática
  const [cuentasDetectadas, setCuentasDetectadas] = useState<CuentaDetectada[]>([])
  const [mapeo, setMapeo] = useState<Record<string, string>>({})  // nombre_zcuentas → fluxo_account_id
  const [detectError, setDetectError] = useState<string | null>(null)

  const [duplicateModal, setDuplicateModal] = useState<{ mov: MovimientoImportado; detail: DuplicateDetail }[] | null>(null)
  const [historialOpen, setHistorialOpen] = useState(false)

  const { data: accounts    = [] } = useQuery<Account[]>({ queryKey: ['accounts'],   queryFn: fetchAccounts })
  const { data: categories  = [] } = useQuery<Category[]>({ queryKey: ['categories'], queryFn: fetchCategories })
  const { data: concepts    = [] } = useQuery<Concept[]>({ queryKey: ['concepts'],   queryFn: fetchConcepts })
  const { data: households  = [] } = useQuery({ queryKey: ['households'], queryFn: fetchHouseholds })
  const { data: historial   = [] } = useQuery({
    queryKey: ['importacion-historial'],
    queryFn: () => fetchHistorialImportaciones(0, 10),
  })

  function updateEdit(idx: number, partial: Partial<RowEdit>) {
    setRowEdits(prev => ({ ...prev, [idx]: { ...prev[idx], ...partial } }))
    if (partial.concepto) setHighlightMissing(false)
  }

  const detectMutation = useMutation({
    mutationFn: () => detectarBanco(archivo!),
    onSuccess: (data) => {
      setBanco(data.banco)
      setDetectError(null)
      if (data.banco === 'zcuentas' && data.cuentas_detectadas.length > 0) {
        setCuentasDetectadas(data.cuentas_detectadas)
        // Pre-rellenar mapeo con las sugerencias automáticas
        const sugerido: Record<string, string> = {}
        data.cuentas_detectadas.forEach(c => {
          sugerido[c.nombre_zcuentas] = c.fluxo_account_id ?? ''
        })
        setMapeo(sugerido)
        setStep('mapeo')
      } else {
        // Para otros bancos: ir directamente a la selección de cuenta
        setCuentasDetectadas([])
        setMapeo({})
        // Quedarse en 'select' para que el usuario elija la cuenta destino
      }
    },
    onError: (err: Error) => {
      setDetectError(err.message || 'No se pudo detectar el formato del archivo')
      setBanco('')
    },
  })

  const parseMutation = useMutation({
    mutationFn: () => {
      if (banco === 'zcuentas') {
        return parsearArchivo(archivo!, banco, null, mapeo)
      }
      return parsearArchivo(archivo!, banco, cuentaId)
    },
    onSuccess: (data) => {
      setParseResult(data)
      const idx  = new Set<number>()
      const edits: Record<number, RowEdit> = {}
      data.movimientos.forEach((m, i) => {
        if (m.estado === 'validado') idx.add(i)
        edits[i] = { concepto: '', esNuevo: false, categoria: m.categoria ?? '', esNuevaCategoria: false, metodo_pago: m.metodo_pago || 'otro', householdId: '', transferDestAccountId: '' }
      })
      setSeleccionados(idx)
      setRowEdits(edits)
      setStep('review')
    },
  })

  const confirmarMutation = useMutation({
    mutationFn: () => {
      const movs: MovimientoImportado[] = parseResult!.movimientos
        .filter((_, i) => seleccionados.has(i))
        .map((m, i) => {
          const edit = rowEdits[i]
          return {
            ...m,
            estado: 'validado' as const,
            concepto: edit?.concepto || '',
            categoria: edit?.categoria || null,
            metodo_pago: edit?.metodo_pago || m.metodo_pago || 'otro',
            household_id: edit?.householdId || null,
            metadata: {
              ...m.metadata,
            },
          }
        })
      return confirmarImportacion({
        movimientos: movs,
        cuenta_id: banco === 'zcuentas' ? null : cuentaId,
        banco,
        nombre_archivo: archivo?.name ?? 'importacion',
      })
    },
    onSuccess: (data) => {
      setDoneResult({ importados: data.importados, descartados: data.descartados })
      invalidateFinancialData(qc)
      qc.invalidateQueries({ queryKey: ['importacion-historial'] })
      qc.invalidateQueries({ queryKey: ['concepts'] })
      qc.invalidateQueries({ queryKey: ['categories'] })
      setStep('done')
    },
  })

  function toggleSeleccion(idx: number) {
    setSeleccionados(prev => {
      const next = new Set(prev)
      if (next.has(idx)) next.delete(idx); else next.add(idx)
      return next
    })
  }

  // filas seleccionadas sin concepto → bloquear confirmar
  const sinConcepto = [...seleccionados].filter(i => {
    const e = rowEdits[i]
    return !e?.concepto || (e.esNuevo && !e.concepto.trim())
  }).length

  // ── STEP: select ────────────────────────────────────────────────────────
  if (step === 'select') {
    const isDetecting = detectMutation.isPending
    const isParsing = parseMutation.isPending
    const bancoDetectado = banco && !isDetecting

    // Para no-Zcuentas: requiere cuenta destino
    const puedeAnalizar = !!archivo && !!banco && (banco === 'zcuentas' || !!cuentaId)

    return (
      <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
        <div className="max-w-2xl mx-auto">

          <nav className="flex gap-1.5 mb-6 overflow-x-auto [scrollbar-width:none] pb-0.5">
            <button
              onClick={() => navigate('/')}
              className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent transition-colors"
            >
              <Activity className="w-4 h-4" /><span className="hidden sm:inline">Análisis Global</span>
            </button>
            <button
              onClick={() => navigate('/stats')}
              className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent transition-colors"
            >
              <BarChart2 className="w-4 h-4" /><span className="hidden sm:inline">Análisis Mensual</span>
            </button>
            <button
              onClick={() => navigate('/hogar')}
              className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent transition-colors"
            >
              <Home className="w-4 h-4" /><span className="hidden sm:inline">Hogar</span>
            </button>
            <button className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Upload className="w-4 h-4" /><span className="hidden sm:inline">Importar</span>
            </button>
          </nav>

          <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-1">Nueva Importación</h2>
            <p className="text-sm text-slate-400 mb-6">
              Subí el extracto de tu banco — Fluxo detecta el formato automáticamente.
            </p>

            {/* Zona de archivo */}
            <div className="mb-4">
              <label className="block text-sm font-medium text-slate-400 mb-1">Archivo</label>
              <div
                onClick={() => fileRef.current?.click()}
                className={`flex flex-col items-center justify-center gap-2 border-2 border-dashed rounded-xl p-5 sm:p-8 cursor-pointer transition-colors ${
                  archivo
                    ? 'border-emerald-500/50 hover:border-emerald-400/60'
                    : 'border-slate-700 hover:border-emerald-500/50'
                }`}
              >
                <FileSpreadsheet className={`w-8 h-8 ${archivo ? 'text-emerald-400' : 'text-slate-500'}`} />
                {archivo
                  ? <span className="text-sm text-emerald-400 font-medium">{archivo.name}</span>
                  : <span className="text-sm text-slate-500">Excel (.xlsx), CSV (.csv) o PDF (.pdf)</span>
                }
              </div>
              <input
                ref={fileRef}
                type="file"
                accept=".xlsx,.xls,.csv,.pdf"
                className="hidden"
                onChange={e => {
                  const f = e.target.files?.[0] ?? null
                  setArchivo(f)
                  setBanco('')
                  setDetectError(null)
                  setCuentaId('')
                  if (f) detectMutation.mutate()
                }}
              />
            </div>

            {/* Estado de detección */}
            {isDetecting && (
              <div className="flex items-center gap-2 mb-4 px-4 py-2.5 rounded-xl bg-slate-800/60 text-slate-400 text-sm">
                <Loader2 className="w-4 h-4 animate-spin" />
                Detectando banco…
              </div>
            )}

            {/* Detección fallida → selección manual */}
            {detectError && archivo && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3 px-4 py-2.5 rounded-xl bg-slate-800/60 text-slate-400 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  No se detectó el banco automáticamente — seleccionalo manualmente.
                </div>
                <label className="block text-sm font-medium text-slate-400 mb-1">Banco</label>
                <select
                  value={banco}
                  onChange={e => { setBanco(e.target.value); setDetectError(null) }}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500/50"
                >
                  <option value="">Seleccionar banco…</option>
                  {Object.entries(BANCO_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Banco detectado automáticamente */}
            {bancoDetectado && !detectError && (
              <div className="flex items-center gap-2 mb-4 px-4 py-2.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm">
                <Wand2 className="w-4 h-4 shrink-0" />
                Banco detectado: <span className="font-semibold ml-1">{BANCO_LABELS[banco] ?? banco}</span>
              </div>
            )}

            {/* Cuenta destino — solo para no-Zcuentas */}
            {bancoDetectado && banco !== 'zcuentas' && (
              <div className="mb-6">
                <label className="block text-sm font-medium text-slate-400 mb-1">Cuenta destino</label>
                <select
                  value={cuentaId}
                  onChange={e => setCuentaId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500/50"
                >
                  <option value="">Seleccionar cuenta…</option>
                  {accounts.map(a => (
                    <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                  ))}
                </select>
              </div>
            )}

            {/* CTA */}
            {bancoDetectado && banco === 'zcuentas' ? (
              <button
                onClick={() => setStep('mapeo')}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors"
              >
                <ChevronRight className="w-4 h-4" /> Mapear cuentas
              </button>
            ) : (
              <button
                disabled={!puedeAnalizar || isParsing}
                onClick={() => parseMutation.mutate()}
                className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {isParsing
                  ? <><Loader2 className="w-4 h-4 animate-spin" /> Procesando…</>
                  : <><ChevronRight className="w-4 h-4" /> Analizar archivo</>}
              </button>
            )}

            {parseMutation.isError && (
              <p className="mt-3 text-sm text-rose-400 text-center">
                {(parseMutation.error as Error).message || 'Error al procesar el archivo'}
              </p>
            )}
          </div>

          {historial.length > 0 && (
            <div className="border border-slate-800/50 rounded-2xl overflow-hidden">
              <button
                onClick={() => setHistorialOpen(v => !v)}
                className="w-full flex items-center justify-between px-5 py-3.5 bg-slate-900/50 hover:bg-slate-800/50 transition-colors"
              >
                <div className="flex items-center gap-2 text-sm font-medium text-slate-300">
                  <Clock className="w-4 h-4 text-slate-500" />
                  Historial de importaciones
                  <span className="text-xs text-slate-600 font-normal">({historial.length})</span>
                </div>
                <ChevronRight className={`w-4 h-4 text-slate-500 transition-transform duration-200 ${historialOpen ? 'rotate-90' : ''}`} />
              </button>
              {historialOpen && (
                <div className="flex flex-col gap-1.5 p-3 bg-slate-950/40">
                  {historial.map(h => (
                    <div key={h.id} className="flex items-center justify-between text-sm bg-slate-900/60 rounded-xl px-4 py-2.5">
                      <div className="flex items-center gap-3">
                        <span className="text-slate-300">{fmtFecha(h.fecha)}</span>
                        <span className="text-slate-500">{h.banco ?? '—'}</span>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-emerald-400">+{h.total_importados}</span>
                        <span className={`px-2 py-0.5 rounded-full text-xs border ${estadoBadge(h.estado)}`}>{h.estado}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    )
  }

  // ── STEP: mapeo (Zcuentas multi-cuenta) ────────────────────────────────
  if (step === 'mapeo') {
    const todosAsignados = cuentasDetectadas.every(c => !!mapeo[c.nombre_zcuentas])
    return (
      <div className="min-h-screen bg-slate-950 text-white p-4 md:p-8">
        <div className="max-w-2xl mx-auto">

          <nav className="flex gap-1.5 mb-6 overflow-x-auto [scrollbar-width:none] pb-0.5">
            <button
              onClick={() => setStep('select')}
              className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent transition-colors"
            >
              <ArrowLeft className="w-4 h-4" /><span className="hidden sm:inline">Volver</span>
            </button>
            <button className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
              <Wand2 className="w-4 h-4" /><span className="hidden sm:inline">Mapear cuentas</span>
            </button>
          </nav>

          <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-6 mb-6">
            <h2 className="text-lg font-semibold text-white mb-1">Mapeo de cuentas — Zcuentas</h2>
            <p className="text-sm text-slate-400 mb-5">
              Indica a qué cuenta de Fluxo corresponde cada cuenta de Zcuentas.
              Fluxo sugirió las coincidencias más probables.
            </p>

            <div className="space-y-3 mb-6">
              {cuentasDetectadas.map(c => (
                <div key={c.nombre_zcuentas} className="bg-slate-800/60 rounded-xl p-4">
                  <div className="flex items-start justify-between gap-3 mb-2">
                    <div>
                      <p className="text-sm font-medium text-slate-200">{c.nombre_zcuentas}</p>
                      <p className="text-xs text-slate-500">Moneda detectada: {c.moneda}</p>
                    </div>
                    {c.score >= 0.4 && (
                      <span className="shrink-0 text-xs px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                        sugerida
                      </span>
                    )}
                  </div>
                  <select
                    value={mapeo[c.nombre_zcuentas] ?? ''}
                    onChange={e => setMapeo(prev => ({ ...prev, [c.nombre_zcuentas]: e.target.value }))}
                    className="w-full bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500/50 appearance-none cursor-pointer"
                  >
                    <option value="">Seleccionar cuenta…</option>
                    {accounts.map(a => (
                      <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>

            {!todosAsignados && (
              <p className="text-xs text-amber-400 mb-3">
                Asigná una cuenta de Fluxo a cada cuenta de Zcuentas para continuar.
              </p>
            )}

            <button
              disabled={!todosAsignados || parseMutation.isPending}
              onClick={() => parseMutation.mutate()}
              className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {parseMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Procesando…</>
                : <><ChevronRight className="w-4 h-4" /> Analizar movimientos</>}
            </button>

            {parseMutation.isError && (
              <p className="mt-3 text-sm text-rose-400 text-center">
                {(parseMutation.error as Error).message || 'Error al procesar el archivo'}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  // ── STEP: review ────────────────────────────────────────────────────────
  if (step === 'review' && parseResult) {
    const validados    = parseResult.movimientos.filter(m => m.estado === 'validado').length
    const duplicados   = parseResult.movimientos.filter(m => m.estado === 'duplicado').length
    const errores      = parseResult.movimientos.filter(m => m.estado === 'error').length
    const advertencias = parseResult.movimientos.filter(m => m.advertencia).length

    return (
      <div className="min-h-screen p-4 md:p-6 bg-slate-950 text-white">
        <div className="w-full">

          <nav className="flex gap-1.5 mb-6 overflow-x-auto [scrollbar-width:none] pb-0.5">
            <button
              onClick={() => setStep('select')}
              className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium border border-transparent transition-colors text-slate-400 hover:text-slate-200 hover:bg-slate-800"
            >
              <ArrowLeft className="w-4 h-4" /><span className="hidden sm:inline">Volver</span>
            </button>
            <button className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-semibold bg-teal-500/20 text-teal-400 border border-teal-500/30">
              <Upload className="w-4 h-4" /><span className="hidden sm:inline">Revisar movimientos</span>
            </button>
          </nav>

          {/* summary chips */}
          <div className={`flex gap-3 mb-4 flex-wrap py-3 px-1 ${isLight ? 'bg-white border-b border-slate-100 rounded-xl' : ''}`}>
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm ${
              isLight ? 'bg-emerald-50 text-emerald-600' : 'bg-emerald-500/10 border border-emerald-500/20 text-emerald-400'
            }`}>
              <CheckCircle2 className="w-4 h-4" /> {validados} válidos
            </div>
            <div className={`flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-xl text-sm ${
              isLight ? 'bg-amber-50 text-amber-600' : 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
            }`}>
              <Clock className="w-4 h-4" />
              <span>{duplicados} duplicados</span>
              {duplicados > 0 && (() => {
                const dupeItems = parseResult.movimientos
                  .filter(m => (m.estado === 'duplicado' || m.advertencia) && m.duplicate_detail)
                  .map(m => ({ mov: m, detail: m.duplicate_detail! }))
                return dupeItems.length > 0 ? (
                  <button
                    onClick={() => setDuplicateModal(dupeItems)}
                    className={`flex items-center gap-1 px-2 py-0.5 rounded-lg text-xs font-semibold active:scale-95 transition-all ${
                      isLight
                        ? 'bg-amber-100/40 text-amber-700 hover:bg-amber-100 border border-amber-200/50'
                        : 'bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30'
                    }`}
                  >
                    <TriangleAlert className="w-3 h-3" />
                    Ver detalles
                  </button>
                ) : null
              })()}
            </div>
            {errores > 0 && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm ${
                isLight ? 'bg-rose-50 text-rose-600' : 'bg-rose-500/10 border border-rose-500/20 text-rose-400'
              }`}>
                <AlertCircle className="w-4 h-4" /> {errores} errores
              </div>
            )}
            {advertencias > 0 && (
              <div className={`flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm ${
                isLight ? 'bg-amber-50 text-amber-600' : 'bg-amber-500/10 border border-amber-500/20 text-amber-400'
              }`}>
                <AlertCircle className="w-4 h-4" /> {advertencias} posible{advertencias > 1 ? 's' : ''} duplicado{advertencias > 1 ? 's' : ''}
              </div>
            )}
            <div className={`ml-auto flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm ${isLight ? 'bg-slate-100 text-slate-600' : 'bg-slate-800 text-slate-300'}`}>
              {seleccionados.size} seleccionados
            </div>
          </div>

          {sinConcepto > 0 && (
            <div className={`mb-4 flex items-center gap-2 px-4 py-2.5 rounded-xl border-l-4 border-amber-400 text-sm ${
              isLight ? 'bg-amber-50/50 text-amber-800' : 'bg-amber-900/20 text-amber-100'
            }`}>
              <AlertCircle className="w-4 h-4 shrink-0" />
              {sinConcepto} movimiento{sinConcepto > 1 ? 's' : ''} sin concepto asignado — seleccioná o creá uno para continuar.
            </div>
          )}

          {/* tabla */}
          <div className={`border rounded-2xl overflow-hidden mb-6 ${isLight ? 'bg-white border-slate-200' : 'bg-slate-900/50 border-slate-800/50'}`}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className={`border-b ${isLight ? 'border-slate-200' : 'border-slate-800/50'}`}>
                    <th className="px-3 py-3 w-8"></th>
                    <th className={`px-3 py-3 text-left text-sm font-medium whitespace-nowrap ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Fecha</th>
                    <th className={`px-3 py-3 text-left text-sm font-medium ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Descripción del banco</th>
                    <th className={`px-3 py-3 text-right text-sm font-medium whitespace-nowrap ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Monto</th>
                    <th className={`px-3 py-3 text-left text-sm font-medium ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Concepto</th>
                    <th className={`px-3 py-3 text-left text-sm font-medium ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Categoría</th>
                    <th className={`px-3 py-3 text-left text-sm font-medium whitespace-nowrap ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Método</th>
                    <th className={`px-3 py-3 text-left text-sm font-medium whitespace-nowrap ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Hogar</th>
                    <th className={`px-3 py-3 text-left text-sm font-medium ${isLight ? 'text-slate-500' : 'text-slate-500'}`}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {parseResult.movimientos.map((m, i) => {
                    const edit = rowEdits[i] ?? { concepto: '', esNuevo: false, categoria: m.categoria ?? '', esNuevaCategoria: false, metodo_pago: m.metodo_pago || 'otro', householdId: '' }
                    const isError = m.estado === 'error'
                    const selected = seleccionados.has(i)
                    const missingConcept = highlightMissing && selected && (!edit?.concepto || (edit.esNuevo && !edit.concepto.trim()))

                    return (
                      <tr
                        key={i}
                        className={`border-b transition-colors ${isLight ? 'border-slate-200' : 'border-slate-800/30'} ${
                          isError
                            ? 'opacity-40'
                            : missingConcept
                              ? 'cursor-pointer bg-rose-500/10 border border-rose-500/20'
                              : `cursor-pointer ${selected ? 'bg-emerald-500/5' : isLight ? 'hover:bg-slate-50/80' : 'hover:bg-slate-800/30'}`
                        }`}
                      >
                        {/* checkbox */}
                        <td className="px-3 py-2.5" onClick={() => !isError && toggleSeleccion(i)}>
                          {!isError && (
                            <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${
                              selected ? 'bg-emerald-500 border-emerald-500' : 'border-slate-600'
                            }`}>
                              {selected && <CheckCircle2 className="w-3 h-3 text-slate-950" />}
                            </div>
                          )}
                        </td>

                        {/* fecha */}
                        <td className={`px-3 py-2.5 whitespace-nowrap text-sm ${isLight ? 'text-slate-700' : 'text-slate-300'}`} onClick={() => !isError && toggleSeleccion(i)}>
                          {m.fecha}
                        </td>

                        {/* descripcion banco */}
                        <td className="px-3 py-2.5 max-w-[220px]" onClick={() => !isError && toggleSeleccion(i)}>
                          <span className={`text-sm truncate block ${isLight ? 'text-slate-500' : 'text-slate-400'}`} title={m.descripcion ?? ''}>
                            {m.descripcion ?? '—'}
                          </span>
                          {m.error && <span className="text-rose-400 text-xs">{m.error}</span>}
                        </td>

                        {/* monto */}
                        <td
                          className="px-3 py-2.5 text-right font-medium whitespace-nowrap text-sm"
                          onClick={() => !isError && toggleSeleccion(i)}
                        >
                          <span className={m.monto < 0
                            ? (isLight ? 'text-rose-500' : 'text-rose-400')
                            : (isLight ? 'text-emerald-600' : 'text-emerald-400')
                          }>
                            {m.monto < 0 ? '-' : '+'}{Math.abs(m.monto).toLocaleString('es-UY')}
                          </span>
                          <span className="ml-1 text-slate-400 font-normal">{m.moneda}</span>
                        </td>

                        {/* concepto selector */}
                        <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                          {!isError && (
                            <ConceptoCell
                              edit={edit}
                              concepts={concepts}
                              onChange={partial => updateEdit(i, partial)}
                              isLight={isLight}
                            />
                          )}
                        </td>

                        {/* categoria selector */}
                        <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                          {!isError && (
                            <CategoriaCell
                              edit={edit}
                              categories={categories}
                              onChange={partial => updateEdit(i, partial)}
                              isLight={isLight}
                            />
                          )}
                        </td>

                        {/* metodo pago */}
                        <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                          {!isError && (
                            <MetodoPagoCell
                              value={edit.metodo_pago}
                              onChange={v => updateEdit(i, { metodo_pago: v })}
                              isLight={isLight}
                            />
                          )}
                        </td>

                        {/* hogar — para gastos (monto negativo) */}
                        <td className="px-3 py-2" onClick={e => e.stopPropagation()}>
                          {!isError && m.monto < 0
                            ? <HogarCell
                                value={edit.householdId}
                                households={households}
                                onChange={id => updateEdit(i, { householdId: id })}
                              />
                            : <span className={`text-xs ${isLight ? 'text-slate-400' : 'text-slate-700'}`}>—</span>
                          }
                        </td>

                        {/* estado */}
                        <td className="px-3 py-2.5">
                          <span className={`px-2 py-0.5 rounded-full text-xs border whitespace-nowrap ${estadoBadge(m.estado, isLight)}`}>
                            {m.estado}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* actions */}
          <div className="flex gap-3 justify-end">
            <button
              onClick={() => setStep('select')}
              className={`px-5 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                isLight
                  ? 'text-slate-500 hover:text-slate-900 hover:bg-slate-200 border border-slate-300'
                  : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-700'
              }`}
            >
              Cancelar
            </button>
            <button
              disabled={seleccionados.size === 0 || sinConcepto > 0 || confirmarMutation.isPending}
              onClick={() => {
                if (sinConcepto > 0) { setHighlightMissing(true); return }
                confirmarMutation.mutate()
              }}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              {confirmarMutation.isPending
                ? <><Loader2 className="w-4 h-4 animate-spin" /> Importando…</>
                : <><CheckCircle2 className="w-4 h-4" /> Importar {seleccionados.size} movimientos</>}
            </button>
          </div>

          {confirmarMutation.isError && (
            <p className="mt-3 text-sm text-rose-400 text-right">
              {(confirmarMutation.error as Error).message || 'Error al confirmar la importación'}
            </p>
          )}
        </div>

        {duplicateModal && (
          <DuplicateDetailModal
            items={duplicateModal}
            onClose={() => setDuplicateModal(null)}
          />
        )}
      </div>
    )
  }

  // ── STEP: done ─────────────────────────────────────────────────────────
  if (step === 'done' && doneResult) {
    return (
      <div className="min-h-screen bg-slate-950 text-white flex items-center justify-center p-4">
        <div className="max-w-sm w-full bg-slate-900/50 border border-slate-800/50 rounded-2xl p-8 text-center">
          <div className="w-16 h-16 bg-emerald-500/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">¡Importación completada!</h2>
          <p className="text-slate-400 text-sm mb-6">
            Se importaron <span className="text-emerald-400 font-semibold">{doneResult.importados}</span> movimientos
            {doneResult.descartados > 0 && (
              <> y se descartaron <span className="text-amber-400 font-semibold">{doneResult.descartados}</span></>
            )}.
          </p>
          <div className="flex gap-3">
            <button
              onClick={() => { setStep('select'); setParseResult(null); setArchivo(null) }}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-slate-700 transition-colors"
            >
              Nueva importación
            </button>
            <button
              onClick={() => navigate('/')}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold bg-emerald-500 hover:bg-emerald-400 text-slate-950 transition-colors"
            >
              Ir al Hub
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}
