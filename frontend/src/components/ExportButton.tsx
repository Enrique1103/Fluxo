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
      className="p-2 rounded-lg bg-slate-950 border border-slate-800 text-slate-400 hover:text-slate-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
    >
      {loading
        ? <Loader2 className="w-5 h-5 animate-spin" />
        : <Download className="w-5 h-5" />
      }
    </button>
  )
}
