import { useEffect } from 'react'
import { AlertTriangle, X } from 'lucide-react'

interface Props {
  open: boolean
  title: string
  message: string
  confirmLabel?: string
  cancelLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}

export default function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirmar',
  cancelLabel = 'Cancelar',
  danger = false,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    if (!open) return
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel()
      if (e.key === 'Enter') onConfirm()
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [open, onConfirm, onCancel])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onCancel}
      />
      {/* Card */}
      <div className="relative z-10 bg-slate-900 border border-slate-700/80 rounded-2xl p-6 shadow-2xl w-full max-w-sm mx-4"
        style={{ animation: 'confirmIn 0.15s ease-out' }}
      >

        <button
          onClick={onCancel}
          className="absolute top-4 right-4 text-slate-500 hover:text-slate-300 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div className="flex items-start gap-3 mb-5">
          <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
            danger ? 'bg-red-500/15' : 'bg-amber-500/15'
          }`}>
            <AlertTriangle className={`w-5 h-5 ${danger ? 'text-red-400' : 'text-amber-400'}`} />
          </div>
          <div className="pt-0.5">
            <h3 className="text-white font-semibold text-sm leading-snug">{title}</h3>
            <p className="text-slate-400 text-sm mt-1 leading-relaxed">{message}</p>
          </div>
        </div>

        <div className="flex gap-2 justify-end">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-slate-300 bg-slate-800 hover:bg-slate-700 rounded-xl transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-bold rounded-xl transition-all active:scale-95 ${
              danger
                ? 'bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-500/20'
                : 'bg-gradient-to-r from-emerald-500 to-emerald-600 hover:from-emerald-400 hover:to-emerald-500 text-slate-950 shadow-lg shadow-emerald-500/20'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
