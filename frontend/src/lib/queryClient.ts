import { QueryClient } from '@tanstack/react-query'

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      staleTime: 1000 * 60 * 5, // 5 min
    },
  },
})

/**
 * Invalida todas las queries de datos financieros.
 * Usar después de CUALQUIER mutación que afecte montos, cuentas, transacciones
 * o configuración del usuario.  Toda funcionalidad nueva debe llamar a esta
 * función en lugar de invalidar queries individuales a mano.
 */
export function invalidateFinancialData(qc: QueryClient): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['summary'] }),
    qc.invalidateQueries({ queryKey: ['patrimonio'] }),
    qc.invalidateQueries({ queryKey: ['income-vs-expenses'] }),
    qc.invalidateQueries({ queryKey: ['monthly-breakdown'] }),
    qc.invalidateQueries({ queryKey: ['accounts'] }),
    qc.invalidateQueries({ queryKey: ['exchange-rates-check'] }),
    qc.invalidateQueries({ queryKey: ['fin-goals'] }),
    qc.invalidateQueries({ queryKey: ['instalment-plans'] }),
    qc.invalidateQueries({ queryKey: ['household-analytics'] }),
  ]).then(() => undefined)
}
