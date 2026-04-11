import { useEffect } from 'react'
import { X, ChevronDown } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { fetchAccounts } from '../api/dashboard'

export type TransferDest =
  | { type: 'internal'; accountId: string; label: string }

interface Props {
  open: boolean
  sourceAccountId: string
  onSelect: (dest: TransferDest) => void
  onClose: () => void
}

const selectClass =
  'bg-slate-800 border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-slate-200 outline-none focus:border-emerald-500/60 transition-colors w-full appearance-none cursor-pointer'

export default function TransferDestinationPicker({ open, sourceAccountId, onSelect, onClose }: Props) {
  const { data: accounts = [] } = useQuery({
    queryKey: ['accounts'],
    queryFn:  fetchAccounts,
    enabled:  open,
  })

  const myAccounts = accounts.filter(a => a.id !== sourceAccountId)

  useEffect(() => {
    if (open && myAccounts.length === 1) {
      const a = myAccounts[0]
      onSelect({ type: 'internal', accountId: a.id, label: `${a.name} · ${a.currency}` })
    }
  }, [open])

  if (!open) return null

  return (
    <div className="fixed inset-0 z-60 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl p-5 w-full max-w-sm shadow-2xl">

        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-white">Seleccioná cuenta destino</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white transition-colors rounded-lg hover:bg-slate-800">
            <X className="w-4 h-4" />
          </button>
        </div>

        {myAccounts.length === 0 ? (
          <p className="text-slate-500 text-xs text-center py-6">No tenés otras cuentas disponibles</p>
        ) : (
          <div className="relative">
            <select
              defaultValue=""
              onChange={e => {
                const acct = myAccounts.find(a => a.id === e.target.value)
                if (!acct) return
                onSelect({ type: 'internal', accountId: acct.id, label: `${acct.name} · ${acct.currency}` })
              }}
              className={selectClass}
            >
              <option value="" disabled>Seleccioná una cuenta</option>
              {myAccounts.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.currency} · {Number(a.balance).toLocaleString()}
                </option>
              ))}
            </select>
            <ChevronDown className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
          </div>
        )}

        <button
          onClick={onClose}
          className="w-full mt-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-sm font-medium transition-colors"
        >
          Cancelar
        </button>
      </div>
    </div>
  )
}
