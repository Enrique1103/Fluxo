import { useState, useEffect } from 'react'
import { X, Loader2 } from 'lucide-react'
import DatePicker from './DatePicker'
import { useQueryClient } from '@tanstack/react-query'
import {
  createFinGoal,
  updateFinGoalFull,
  type FinGoal,
} from '../api/dashboard'

interface Props {
  open: boolean
  onClose: () => void
  goal?: FinGoal
  existingGoals?: FinGoal[]
}

const inputClass =
  'bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500/60 transition-colors w-full'
const labelClass = 'text-xs text-slate-400 mb-1 block'

function parseErr(err: unknown, fallback: string): string {
  const e = err as any
  if (!e?.response) return 'Sin conexión con el servidor — verificá que el backend esté activo'
  const detail = e.response?.data?.detail
  if (!detail) return fallback
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) return detail.map((x: unknown) => (x as { msg?: string })?.msg ?? String(x)).join('. ')
  return fallback
}

export default function GoalModal({ open, onClose, goal, existingGoals }: Props) {
  const queryClient = useQueryClient()
  const isEdit = Boolean(goal)

  const [name,          setName]          = useState('')
  const [targetAmount,  setTargetAmount]  = useState('')
  const [allocationPct, setAllocationPct] = useState(0)
  const [deadline,      setDeadline]      = useState('')
  const [submitting,    setSubmitting]    = useState(false)
  const [serverError,   setServerError]   = useState<string | null>(null)

  // Populate fields in edit mode
  useEffect(() => {
    if (goal && open) {
      setName(goal.name)
      setTargetAmount(String(goal.target_amount))
      setAllocationPct(goal.allocation_pct)
      setDeadline(goal.deadline ?? '')
    }
  }, [goal, open])

  // Reset when modal closes
  useEffect(() => {
    if (!open) {
      setName('')
      setTargetAmount('')
      setAllocationPct(0)
      setDeadline('')
      setServerError(null)
    }
  }, [open])

  const handleSubmit = async () => {
    setServerError(null)

    if (name.trim().length < 2) {
      setServerError('El nombre debe tener al menos 2 caracteres')
      return
    }
    const amt = parseFloat(targetAmount)
    if (isNaN(amt) || amt <= 0) {
      setServerError('La meta debe ser mayor a 0')
      return
    }

    if (existingGoals) {
      if (!isEdit) {
        const totalAllocated = existingGoals.reduce((sum, g) => sum + g.allocation_pct, 0)
        if (totalAllocated + allocationPct > 100) {
          setServerError(`La suma de porcentajes (${totalAllocated + allocationPct}%) supera el 100%. Disponible: ${100 - totalAllocated}%`)
          return
        }
      } else if (goal) {
        const totalAllocated = existingGoals.filter(g => g.id !== goal.id).reduce((sum, g) => sum + g.allocation_pct, 0)
        if (totalAllocated + allocationPct > 100) {
          setServerError(`La suma de porcentajes (${totalAllocated + allocationPct}%) supera el 100%. Disponible: ${100 - totalAllocated}%`)
          return
        }
      }
    }

    setSubmitting(true)
    try {
      if (isEdit && goal) {
        await updateFinGoalFull(goal.id, {
          name:           name.trim(),
          target_amount:  amt,
          allocation_pct: allocationPct,
          deadline:       deadline || null,
        })
      } else {
        await createFinGoal({
          name:           name.trim(),
          target_amount:  amt,
          allocation_pct: allocationPct,
          deadline:       deadline || undefined,
        })
      }
      await queryClient.invalidateQueries({ queryKey: ['fin-goals'] })
      await queryClient.invalidateQueries({ queryKey: ['summary'] })
      onClose()
    } catch (err) {
      setServerError(parseErr(err, isEdit ? 'No se pudo actualizar la meta' : 'No se pudo crear la meta'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-800 rounded-3xl p-6 w-full max-w-md shadow-2xl">

        {/* Header */}
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-base font-semibold text-white">
            {isEdit ? 'Editar Meta' : 'Nueva Meta'}
          </h2>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="space-y-4">

          {/* Nombre */}
          <div>
            <label className={labelClass}>Nombre</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="Ej: Fondo de emergencia"
              className={inputClass}
            />
          </div>

          {/* Meta ($) */}
          <div>
            <label className={labelClass}>Meta ($)</label>
            <input
              type="number"
              min="0.01"
              step="0.01"
              value={targetAmount}
              onChange={e => setTargetAmount(e.target.value)}
              placeholder="0.00"
              className={inputClass}
            />
          </div>

          {/* % del flujo asignado */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className={labelClass + ' mb-0'}>% del flujo asignado</label>
              <span className="text-xs font-semibold text-emerald-400">{allocationPct}%</span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={allocationPct}
              onChange={e => setAllocationPct(Number(e.target.value))}
              className="w-full h-2 bg-slate-700 rounded-full appearance-none cursor-pointer accent-emerald-400"
            />
            <div className="flex justify-between text-[10px] text-slate-600 mt-1 px-0.5">
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>

          {/* Fecha límite */}
          <div>
            <label className={labelClass}>Fecha límite (opcional)</label>
            <DatePicker value={deadline} onChange={setDeadline} placeholder="Sin fecha límite" />
          </div>

          {serverError && (
            <p className="text-rose-400 text-xs mt-1">{serverError}</p>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-2.5 bg-gradient-to-r from-emerald-500 to-cyan-500 hover:from-emerald-400 hover:to-cyan-400 disabled:opacity-50 disabled:cursor-not-allowed text-slate-950 rounded-xl text-sm font-bold transition-all flex items-center justify-center gap-2 mt-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'Guardar cambios' : 'Crear Meta'}
          </button>

        </div>
      </div>
    </div>
  )
}
