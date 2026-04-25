import client from './client'

export interface AdminUser {
  id: string
  name: string
  email: string
  created_at: string
  is_active: boolean
  tx_count: number
  last_activity: string | null
}

export interface AdminUserDetail extends AdminUser {
  account_count: number
  category_count: number
}

export interface AdminStats {
  total_users: number
  active_users: number
  inactive_users: number
  new_users_30d: number
  total_transactions: number
  transactions_30d: number
  users_by_month: { month: string; count: number }[]
  transactions_by_month: { month: string; count: number }[]
}

export const getStats = async (): Promise<AdminStats> => {
  const { data } = await client.get<AdminStats>('/v1/admin/stats')
  return data
}

export const getUsers = async (): Promise<AdminUser[]> => {
  const { data } = await client.get<AdminUser[]>('/v1/admin/users')
  return data
}

export const getUserDetail = async (userId: string): Promise<AdminUserDetail> => {
  const { data } = await client.get<AdminUserDetail>(`/v1/admin/users/${userId}`)
  return data
}

export const toggleUserActive = async (userId: string): Promise<{ id: string; is_active: boolean }> => {
  const { data } = await client.patch(`/v1/admin/users/${userId}/toggle-active`)
  return data
}

export const deleteUser = async (userId: string): Promise<void> => {
  await client.delete(`/v1/admin/users/${userId}`)
}
