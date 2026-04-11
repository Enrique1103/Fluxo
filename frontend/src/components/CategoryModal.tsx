import { useState } from 'react'
import { X, Loader2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { createCategory } from '../api/dashboard'

interface Props {
  open: boolean
  onClose: () => void
}

const PRESET_COLORS = [
  '#22d3ee','#34d399','#a78bfa','#f43f5e','#fb923c',
  '#facc15','#60a5fa','#f472b6','#10b981','#8b5cf6',
]

const inputClass =
  'bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500/60 transition-colors w-full'
const labelClass = 'text-xs text-slate-400 mb-1 block'

function parseErr(err: unknown, fallback: string): string {
  const e = err as any
  if (!e?.response) return 'Sin conexión con el servidor'
  const detail = e.response?.data?.detail
  if (!detail) return fallback
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((x: unknown) => (x as { msg?: string })?.msg ?? String(x)).join('. ')
  return fallback
}

export default function CategoryModal({ open, onClose }: Props) {
  const queryClient = useQueryClient()

  const [name,   setName]   = useState('')
  const [color,  setColor]  = useState(PRESET_COLORS[0])
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  const handleNameChange = (val: string) => {
    setName(val.length > 0 ? val.charAt(0).toUpperCase() + val.slice(1) : val)
  }

  const reset = () => { setName(''); setColor(PRESET_COLORS[0]); setError(null) }
  const handleClose = () => { reset(); onClose() }

  const handleSubmit = async () => {
    if (name.trim().length < 2) { setError('El nombre debe tener al menos 2 caracteres'); return }
    setSaving(true); setError(null)
    try {
      await createCategory({ name: name.trim(), color })
      await queryClient.invalidateQueries({ queryKey: ['categories'] })
      reset()
      onClose()
    } catch (err) {
      setError(parseErr(err, 'No se pudo crear la categoría'))
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl">

        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Nueva Categoría</h2>
          <button onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">

          <div>
            <label className={labelClass}>Nombre</label>
            <input
              type="text"
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
              placeholder="Ej: Educación, Salud, Inversiones…"
              className={inputClass}
            />
          </div>

          <div>
            <label className={labelClass}>Color</label>
            <div className="flex gap-2 flex-wrap">
              {PRESET_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setColor(c)}
                  className="w-7 h-7 rounded-full transition-all"
                  style={{
                    background: c,
                    outline: color === c ? `2px solid ${c}` : undefined,
                    outlineOffset: color === c ? '2px' : undefined,
                    opacity: color === c ? 1 : 0.5,
                  }}
                />
              ))}
            </div>
          </div>

          {error && <p className="text-rose-400 text-xs">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 mt-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Crear Categoría
          </button>

        </div>
      </div>
    </div>
  )
}
