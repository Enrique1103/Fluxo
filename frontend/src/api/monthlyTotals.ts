import client from './client'

export interface MonthlyTotal {
  id: string
  year: number
  month: number
  currency: string
  income: string
  expense: string
  created_at: string
}

export interface MonthlyTotalIn {
  year: number
  month: number
  currency: string
  income: number
  expense: number
}

/** GET /api/v1/monthly-totals */
export const fetchMonthlyTotals = async (): Promise<MonthlyTotal[]> => {
  const { data } = await client.get<MonthlyTotal[]>('/v1/monthly-totals')
  return data
}

/** POST /api/v1/monthly-totals — crea o reemplaza (mismo mes y moneda) */
export const saveMonthlyTotals = async (rows: MonthlyTotalIn[]): Promise<{ created: number; updated: number }> => {
  const { data } = await client.post<{ created: number; updated: number }>('/v1/monthly-totals', { rows })
  return data
}

/** DELETE /api/v1/monthly-totals/{id} */
export const deleteMonthlyTotal = async (id: string): Promise<void> => {
  await client.delete(`/v1/monthly-totals/${id}`)
}
