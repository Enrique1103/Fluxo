import { Plus } from 'lucide-react'

interface Props {
  onClick: () => void
}

export default function FAB({ onClick }: Props) {
  return (
    <button
      onClick={onClick}
      title="Registrar Movimiento"
      className="fixed bottom-7 right-7 z-30 w-14 h-14 bg-gradient-to-br from-emerald-400 to-cyan-500 hover:from-emerald-300 hover:to-cyan-400 text-slate-950 rounded-2xl shadow-2xl shadow-emerald-500/40 flex items-center justify-center transition-all active:scale-95 hover:scale-105"
    >
      <Plus className="w-7 h-7 stroke-[2.5px]" />
    </button>
  )
}
