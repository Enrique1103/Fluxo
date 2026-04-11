import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { createConcept } from '../api/dashboard'

interface Props {
  open: boolean
  onClose: () => void
}

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

export default function ConceptModal({ open, onClose }: Props) {
  const queryClient = useQueryClient()

  const [name,   setName]   = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState<string | null>(null)

  useEffect(() => {
    if (!open) { setName(''); setError(null) }
  }, [open])

  const handleNameChange = (val: string) => {
    setName(val.length > 0 ? val.charAt(0).toUpperCase() + val.slice(1) : val)
  }

  const handleSubmit = async () => {
    if (name.trim().length < 2) { setError('El nombre debe tener al menos 2 caracteres'); return }
    setSaving(true); setError(null)
    try {
      await createConcept({ name: name.trim() })
      await queryClient.invalidateQueries({ queryKey: ['concepts'] })
      setName(''); setError(null)
      onClose()
    } catch (err) {
      setError(parseErr(err, 'No se pudo crear el concepto'))
    } finally {
      setSaving(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">Nuevo Concepto</h2>
          <button onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">

          {/* Nombre */}
          <div>
            <label className={labelClass}>Nombre del concepto</label>
            <input
              type="text"
              value={name}
              onChange={e => handleNameChange(e.target.value)}
              placeholder="Ej: Supermercado, Salario, Netflix…"
              className={inputClass}
              onKeyDown={e => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          {error && <p className="text-rose-400 text-xs">{error}</p>}

          <button
            onClick={handleSubmit}
            disabled={saving}
            className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 mt-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Crear Concepto
          </button>

        </div>
      </div>
    </div>
  )
}
