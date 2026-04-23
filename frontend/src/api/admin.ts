import client from './client'

export interface AdminUser {
  id: string
  name: string
  email: string
  created_at: string
  is_active: boolean
  tx_count: number
}

export const getUsers = async (): Promise<AdminUser[]> => {
  const { data } = await client.get<AdminUser[]>('/v1/admin/users')
  return data
}

export const deleteUser = async (userId: string): Promise<void> => {
  await client.delete(`/v1/admin/users/${userId}`)
}
