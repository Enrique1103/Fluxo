import { useEffect } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useAuthStore } from '../store/authStore'

export function useHouseholdEvents() {
  const qc = useQueryClient()
  const token = useAuthStore((s) => s.token)

  useEffect(() => {
    if (!token) return

    // Misma base que el cliente HTTP: en producción el backend está en otro dominio (VITE_API_URL)
    const base = import.meta.env.VITE_API_URL ?? '/api'
    const es = new EventSource(`${base}/v1/households/events?token=${encodeURIComponent(token)}`)

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
