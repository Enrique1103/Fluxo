import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, Loader2, Lock, Tag, FolderOpen, X, Hash } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchCategories,
  fetchConcepts,
  createCategory,
  updateCategory,
  deleteCategory,
  createConcept,
  updateConcept,
  deleteConcept,
  type Category,
  type Concept,
} from '../api/dashboard'

const PRESET_COLORS = [
  '#22d3ee', '#34d399', '#a78bfa', '#f43f5e', '#fb923c',
  '#facc15', '#60a5fa', '#f472b6', '#10b981', '#8b5cf6',
]

function parseErr(err: unknown, fallback: string): string {
  const e = err as any
  if (!e?.response) return 'Sin conexión con el servidor'
  const detail = e.response?.data?.detail
  if (!detail) return fallback
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((x: unknown) => (x as { msg?: string })?.msg ?? String(x)).join('. ')
  return fallback
}

// ─── Category row ─────────────────────────────────────────────────────────────

function CategoryRow({ cat, onSaved, onDeleted }: {
  cat: Category; onSaved: () => void; onDeleted: () => void
}) {
  const [editing,       setEditing]       = useState(false)
  const [name,          setName]          = useState(cat.name)
  const [color,         setColor]         = useState(cat.color ?? PRESET_COLORS[0])
  const [saving,        setSaving]        = useState(false)
  const [deleting,      setDeleting]      = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error,         setError]         = useState<string | null>(null)

  const handleSave = async () => {
    if (name.trim().length < 2) { setError('Mínimo 2 caracteres'); return }
    setSaving(true); setError(null)
    try {
      await updateCategory(cat.id, { name: name.trim(), color })
      onSaved(); setEditing(false)
    } catch (err) { setError(parseErr(err, 'No se pudo actualizar')) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setDeleting(true); setError(null)
    try { await deleteCategory(cat.id); onDeleted() }
    catch (err) { setError(parseErr(err, 'No se pudo eliminar')); setDeleting(false) }
  }

  const handleCancel = () => { setName(cat.name); setColor(cat.color ?? PRESET_COLORS[0]); setError(null); setEditing(false) }

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="w-3 h-3 rounded-full shrink-0" style={{ background: cat.color ?? '#6B7280' }} />
        {editing ? (
          <input autoFocus type="text" value={name}
            onChange={e => { const v = e.target.value; setName(v.length > 0 ? v.charAt(0).toUpperCase() + v.slice(1) : v) }}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel() }}
            className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-sm text-slate-200 outline-none focus:border-emerald-500/60 transition-colors"
          />
        ) : (
          <span className="flex-1 text-sm text-slate-200 truncate">{cat.name}</span>
        )}
        {cat.is_system ? (
          <Lock className="w-3.5 h-3.5 text-slate-600 shrink-0" />
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            {editing ? (
              <>
                <button onClick={handleSave} disabled={saving} className="p-1 text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-50">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </button>
                <button onClick={handleCancel} className="p-1 text-slate-500 hover:text-slate-300 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            ) : confirmDelete ? (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-rose-400">¿Eliminar?</span>
                <button onClick={handleDelete} disabled={deleting} className="p-1 text-rose-400 hover:text-rose-300 transition-colors">
                  {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => setConfirmDelete(false)} className="p-1 text-slate-500 hover:text-slate-300 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <>
                <button onClick={() => setEditing(true)} className="p-1 text-slate-500 hover:text-slate-300 transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setConfirmDelete(true)} disabled={deleting} className="p-1 text-slate-500 hover:text-rose-400 transition-colors disabled:opacity-50">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {editing && (
        <div className="flex gap-1.5 flex-wrap pl-5">
          {PRESET_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)} className="w-5 h-5 rounded-full transition-all"
              style={{ background: c, outline: color === c ? `2px solid ${c}` : undefined, outlineOffset: color === c ? '2px' : undefined, opacity: color === c ? 1 : 0.45 }} />
          ))}
        </div>
      )}
      {error && <p className="text-rose-400 text-[10px] pl-5">{error}</p>}
    </div>
  )
}

// ─── Concept row ─────────────────────────────────────────────────────────────

function ConceptRow({ concept, onSaved, onDeleted }: {
  concept: Concept; onSaved: () => void; onDeleted: () => void
}) {
  const [editing,       setEditing]       = useState(false)
  const [name,          setName]          = useState(concept.name)
  const [saving,        setSaving]        = useState(false)
  const [deleting,      setDeleting]      = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error,         setError]         = useState<string | null>(null)

  const handleSave = async () => {
    if (name.trim().length < 2) { setError('Mínimo 2 caracteres'); return }
    setSaving(true); setError(null)
    try { await updateConcept(concept.id, { name: name.trim() }); onSaved(); setEditing(false) }
    catch (err) { setError(parseErr(err, 'No se pudo actualizar')) }
    finally { setSaving(false) }
  }

  const handleDelete = async () => {
    setDeleting(true); setError(null)
    try { await deleteConcept(concept.id); onDeleted() }
    catch (err) { setError(parseErr(err, 'No se pudo eliminar')); setDeleting(false) }
  }

  const handleCancel = () => { setName(concept.name); setError(null); setEditing(false) }

  return (
    <div className="bg-slate-800/50 border border-slate-700/50 rounded-xl p-3">
      <div className="flex items-center gap-2">
        <Hash className="w-3 h-3 text-slate-600 shrink-0" />
        {editing ? (
          <input autoFocus type="text" value={name} onChange={e => setName(e.target.value.toUpperCase())}
            onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel() }}
            className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-2 py-1 text-sm text-slate-200 outline-none focus:border-emerald-500/60 transition-colors font-mono tracking-wide"
          />
        ) : (
          <span className="flex-1 text-sm text-slate-200 font-mono tracking-wide truncate">{concept.name}</span>
        )}
        {concept.is_system ? (
          <Lock className="w-3.5 h-3.5 text-slate-600 shrink-0" />
        ) : (
          <div className="flex items-center gap-1 shrink-0">
            {editing ? (
              <>
                <button onClick={handleSave} disabled={saving} className="p-1 text-emerald-400 hover:text-emerald-300 transition-colors disabled:opacity-50">
                  {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </button>
                <button onClick={handleCancel} className="p-1 text-slate-500 hover:text-slate-300 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </>
            ) : confirmDelete ? (
              <div className="flex items-center gap-1">
                <span className="text-[10px] text-rose-400">¿Eliminar?</span>
                <button onClick={handleDelete} disabled={deleting} className="p-1 text-rose-400 hover:text-rose-300 transition-colors">
                  {deleting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                </button>
                <button onClick={() => setConfirmDelete(false)} className="p-1 text-slate-500 hover:text-slate-300 transition-colors">
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <>
                <button onClick={() => setEditing(true)} className="p-1 text-slate-500 hover:text-slate-300 transition-colors">
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button onClick={() => setConfirmDelete(true)} disabled={deleting} className="p-1 text-slate-500 hover:text-rose-400 transition-colors disabled:opacity-50">
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        )}
      </div>
      {error && <p className="text-rose-400 text-[10px] mt-1">{error}</p>}
    </div>
  )
}

// ─── Create forms ─────────────────────────────────────────────────────────────

function CreateCategoryForm({ onCreated }: { onCreated: () => void }) {
  const queryClient = useQueryClient()
  const [open,   setOpen]   = useState(false)
  const [name,   setName]   = useState('')
  const [color,  setColor]  = useState(PRESET_COLORS[0])
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const handleSubmit = async () => {
    if (name.trim().length < 2) { setError('Mínimo 2 caracteres'); return }
    setSaving(true); setError(null)
    try {
      await createCategory({ name: name.trim(), color })
      await queryClient.invalidateQueries({ queryKey: ['categories'] })
      setName(''); setColor(PRESET_COLORS[0]); setOpen(false); onCreated()
    } catch (err) { setError(parseErr(err, 'No se pudo crear')) }
    finally { setSaving(false) }
  }

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-slate-700 hover:border-emerald-500/50 text-slate-500 hover:text-emerald-400 rounded-xl text-sm transition-all">
      <Plus className="w-4 h-4" /> Nueva categoría
    </button>
  )

  return (
    <div className="p-4 bg-slate-800/60 border border-slate-700/60 rounded-xl space-y-3">
      <p className="text-xs text-slate-400 font-semibold">Nueva categoría</p>
      <input autoFocus type="text" value={name}
        onChange={e => { const v = e.target.value; setName(v.length > 0 ? v.charAt(0).toUpperCase() + v.slice(1) : v) }}
        onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') { setOpen(false); setName('') } }}
        placeholder="Nombre de la categoría"
        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500/60 transition-colors"
      />
      <div className="flex gap-1.5 flex-wrap">
        {PRESET_COLORS.map(c => (
          <button key={c} onClick={() => setColor(c)} className="w-6 h-6 rounded-full transition-all"
            style={{ background: c, outline: color === c ? `2px solid ${c}` : undefined, outlineOffset: color === c ? '2px' : undefined, opacity: color === c ? 1 : 0.45 }} />
        ))}
      </div>
      {error && <p className="text-rose-400 text-[10px]">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleSubmit} disabled={saving}
          className="flex-1 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-400 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 disabled:opacity-50">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Crear
        </button>
        <button onClick={() => { setOpen(false); setName(''); setError(null) }}
          className="py-2 px-3 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 text-slate-400 rounded-lg text-xs transition-all">
          Cancelar
        </button>
      </div>
    </div>
  )
}

function CreateConceptForm({ onCreated }: { onCreated: () => void }) {
  const queryClient = useQueryClient()
  const [open,   setOpen]   = useState(false)
  const [name,   setName]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const handleSubmit = async () => {
    if (name.trim().length < 2) { setError('Mínimo 2 caracteres'); return }
    setSaving(true); setError(null)
    try {
      await createConcept({ name: name.trim() })
      await queryClient.invalidateQueries({ queryKey: ['concepts'] })
      setName(''); setOpen(false); onCreated()
    } catch (err) { setError(parseErr(err, 'No se pudo crear')) }
    finally { setSaving(false) }
  }

  if (!open) return (
    <button onClick={() => setOpen(true)}
      className="w-full flex items-center justify-center gap-2 py-2.5 border border-dashed border-slate-700 hover:border-emerald-500/50 text-slate-500 hover:text-emerald-400 rounded-xl text-sm transition-all">
      <Plus className="w-4 h-4" /> Nuevo concepto
    </button>
  )

  return (
    <div className="p-4 bg-slate-800/60 border border-slate-700/60 rounded-xl space-y-3">
      <p className="text-xs text-slate-400 font-semibold">Nuevo concepto</p>
      <input autoFocus type="text" value={name} onChange={e => setName(e.target.value.toUpperCase())}
        onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') { setOpen(false); setName('') } }}
        placeholder="NOMBRE DEL CONCEPTO"
        className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-slate-200 outline-none focus:border-emerald-500/60 transition-colors font-mono tracking-wide"
      />
      {error && <p className="text-rose-400 text-[10px]">{error}</p>}
      <div className="flex gap-2">
        <button onClick={handleSubmit} disabled={saving}
          className="flex-1 py-2 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-400 rounded-lg text-xs font-semibold transition-all flex items-center justify-center gap-1 disabled:opacity-50">
          {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />} Crear
        </button>
        <button onClick={() => { setOpen(false); setName(''); setError(null) }}
          className="py-2 px-3 bg-slate-700/50 hover:bg-slate-700 border border-slate-600 text-slate-400 rounded-lg text-xs transition-all">
          Cancelar
        </button>
      </div>
    </div>
  )
}

// ─── Exportable content (used inside SettingsDrawer) ─────────────────────────

type Tab = 'categories' | 'concepts'

export default function EtiquetasContent() {
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('categories')

  const { data: categories = [], isLoading: loadingCats } = useQuery({
    queryKey: ['categories'], queryFn: fetchCategories,
  })
  const { data: concepts = [], isLoading: loadingConcepts } = useQuery({
    queryKey: ['concepts'], queryFn: fetchConcepts,
  })

  const invalidateCats     = () => queryClient.invalidateQueries({ queryKey: ['categories'] })
  const invalidateConcepts = () => queryClient.invalidateQueries({ queryKey: ['concepts'] })

  return (
    <div className="flex flex-col h-full">
      {/* Tabs */}
      <div className="flex gap-2 mb-4 shrink-0">
        <button onClick={() => setTab('categories')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
            tab === 'categories'
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
          }`}>
          <FolderOpen className="w-3.5 h-3.5" />
          Categorías
          <span className="ml-1 bg-slate-700 text-slate-400 text-[10px] px-1.5 py-0.5 rounded-full">{categories.length}</span>
        </button>
        <button onClick={() => setTab('concepts')}
          className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-all ${
            tab === 'concepts'
              ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
              : 'text-slate-500 hover:text-slate-300 hover:bg-slate-800'
          }`}>
          <Tag className="w-3.5 h-3.5" />
          Conceptos
          <span className="ml-1 bg-slate-700 text-slate-400 text-[10px] px-1.5 py-0.5 rounded-full">{concepts.length}</span>
        </button>
      </div>

      {/* Content */}
      <div className="space-y-2">
        {tab === 'categories' && (
          <>
            {loadingCats ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
            ) : (
              <>
                {categories.length === 0 && <p className="text-center text-xs text-slate-600 py-6">No hay categorías aún</p>}
                {categories.map(cat => (
                  <CategoryRow key={cat.id} cat={cat} onSaved={invalidateCats} onDeleted={invalidateCats} />
                ))}
              </>
            )}
            <div className="pt-2">
              <CreateCategoryForm onCreated={invalidateCats} />
            </div>
          </>
        )}

        {tab === 'concepts' && (
          <>
            {loadingConcepts ? (
              <div className="flex justify-center py-8"><Loader2 className="w-5 h-5 animate-spin text-slate-500" /></div>
            ) : (
              <>
                {concepts.length === 0 && <p className="text-center text-xs text-slate-600 py-6">No hay conceptos aún</p>}
                {concepts.map(concept => (
                  <ConceptRow key={concept.id} concept={concept} onSaved={invalidateConcepts} onDeleted={invalidateConcepts} />
                ))}
              </>
            )}
            <div className="pt-2">
              <CreateConceptForm onCreated={invalidateConcepts} />
            </div>
          </>
        )}
      </div>

      <p className="text-[10px] text-slate-700 text-center mt-4">
        Items con <Lock className="w-2.5 h-2.5 inline" /> son del sistema y no se pueden modificar · No se eliminan etiquetas con transacciones activas
      </p>
    </div>
  )
}
