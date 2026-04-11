import { useState } from 'react'
import { Download, Loader2 } from 'lucide-react'

interface Props {
  onExport: () => Promise<void>
  title?: string
}

export default function ExportButton({ onExport, title = 'Exportar PDF' }: Props) {
  const [loading, setLoading] = useState(false)

  const handleClick = async () => {
    if (loading) return
    setLoading(true)
    try {
      await onExport()
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleClick}
      disabled={loading}
      title={title}
      className="shrink-0 flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium text-slate-400 hover:text-slate-200 hover:bg-slate-800 border border-transparent disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {loading
        ? <Loader2 className="w-4 h-4 animate-spin" />
        : <Download className="w-4 h-4" />
      }
      <span className="hidden sm:inline">{loading ? 'Generando…' : 'Exportar'}</span>
    </button>
  )
}
