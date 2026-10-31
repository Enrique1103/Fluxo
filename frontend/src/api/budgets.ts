import client from './client'

export interface Budget {
  id: string
  user_id: string
  category_id: string
  category_name: string
  extra_category_ids: string[]
  extra_category_names: string[]
  /** null = presupuesto de toda la categoría (suma todos sus conceptos) */
  concept_id: string | null
  concept_name: string | null
  /** Nombre personalizado para presupuestos de varias categorías */
  name: string | null
  month: number
  year: number
  max_amount: number
  currency: string
  spent: number
}

export interface BudgetCreate {
  category_id: string
  extra_category_ids?: string[]
  concept_id?: string | null
  name?: string | null
  month: number
  year: number
  max_amount: number
  currency: string
}

export const fetchBudgets = async (params?: {
  month?: number
  year?: number
  currency?: string
}): Promise<Budget[]> => {
  const { data } = await client.get<Budget[]>('/v1/budgets', { params })
  return data
}

export const createBudget = async (payload: BudgetCreate): Promise<Budget> => {
  const { data } = await client.post<Budget>('/v1/budgets', payload)
  return data
}

export const updateBudget = async (id: string, max_amount: number): Promise<Budget> => {
  const { data } = await client.patch<Budget>(`/v1/budgets/${id}`, { max_amount })
  return data
}

export const deleteBudget = async (id: string): Promise<void> => {
  await client.delete(`/v1/budgets/${id}`)
}

export interface BudgetBulkItem {
  category_id: string
  extra_category_ids?: string[]
  concept_id: string | null
  name?: string | null
  max_amount: number
  currency: string
}

/** Guarda varios presupuestos en un mes (ej: copia editada de otro mes). Los que ya existen se actualizan. */
export const saveBudgetsBulk = async (month: number, year: number, items: BudgetBulkItem[]): Promise<Budget[]> => {
  const { data } = await client.post<Budget[]>('/v1/budgets/bulk', { month, year, items })
  return data
}
