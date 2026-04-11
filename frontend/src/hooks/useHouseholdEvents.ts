import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore'

export function useHouseholdEvents() {
  const qc = useQueryClient()
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    if (!token) return

    const es = new EventSource(`/api/v1/households/events?token=${encodeURIComponent(token)}`)

    es.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data)
        if (event.type === 'removed' || event.type === 'approved') {
          qc.invalidateQueries({ queryKey: ['households'] })
          qc.invalidateQueries({ queryKey: ['household-members'] })
        }
      } catch {
        // ignorar mensajes malformados
      }
    }

    es.onerror = () => {
      // El navegador reintenta automáticamente — no hace falta lógica extra
      es.close()
    }

    return () => es.close()
  }, [token, qc])
}
