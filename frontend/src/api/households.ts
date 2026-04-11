import client from './client'

// --- Types ---

export type SplitType = 'equal' | 'proportional'
export type MemberRole = 'admin' | 'member'
export type MemberStatus = 'pending' | 'active'
export type InviteStatus = 'pending' | 'used' | 'expired'

export interface Household {
  id: string
  name: string
  base_currency: string
  split_type: SplitType
  created_by: string
  created_at: string
}

export interface HouseholdMember {
  id: string
  household_id: string
  user_id: string
  user_name: string
  role: MemberRole
  status: MemberStatus
  joined_at: string | null
}

export interface HouseholdInvite {
  id: string
  household_id: string
  code: string
  expires_at: string
  status: InviteStatus
}

export interface MemberContribution {
  user_id: string
  user_name: string
  income_pct: number
  expenses_paid: number
  should_pay: number
  balance: number
}

export interface SettlementItem {
  from_user_id: string
  from_user_name: string
  to_user_id: string
  to_user_name: string
  amount: number
  currency: string
}

export interface SharedExpense {
  transaction_id: string
  date: string
  concept_name: string
  category_name: string
  amount: number
  currency: string
  paid_by_user_id: string
  paid_by_user_name: string
}

export interface HouseholdAlert {
  type: 'missing_rate' | 'no_income' | 'pending_member'
  message: string
  user_id?: string
  currency?: string
}

export interface CategoryBreakdown {
  category_name: string
  total: number
  currency: string
}

export interface HouseholdAnalytics {
  household_id: string
  period: string
  split_type: SplitType
  members: MemberContribution[]
  shared_expenses: SharedExpense[]
  settlement: SettlementItem[]
  alerts: HouseholdAlert[]
  expense_by_category: CategoryBreakdown[]
  total_shared: number
  base_currency: string
}

// --- API calls ---

export const fetchHouseholds = async (): Promise<Household[]> => {
  const { data } = await client.get<Household[]>('/v1/households')
  return data
}

export const createHousehold = async (payload: {
  name: string
  base_currency?: string
  split_type?: SplitType
}): Promise<Household> => {
  const { data } = await client.post<Household>('/v1/households', payload)
  return data
}

export const updateHousehold = async (
  id: string,
  payload: { name?: string; base_currency?: string; split_type?: SplitType },
): Promise<Household> => {
  const { data } = await client.patch<Household>(`/v1/households/${id}`, payload)
  return data
}

export const deleteHousehold = async (id: string): Promise<void> => {
  await client.delete(`/v1/households/${id}`)
}

export const generateInvite = async (householdId: string): Promise<HouseholdInvite> => {
  const { data } = await client.post<HouseholdInvite>(`/v1/households/${householdId}/invite`)
  return data
}

export const joinHousehold = async (code: string): Promise<HouseholdMember> => {
  const { data } = await client.post<HouseholdMember>('/v1/households/join', { code })
  return data
}

export const fetchMembers = async (householdId: string): Promise<HouseholdMember[]> => {
  const { data } = await client.get<HouseholdMember[]>(`/v1/households/${householdId}/members`)
  return data
}

export const approveMember = async (householdId: string, userId: string): Promise<HouseholdMember> => {
  const { data } = await client.post<HouseholdMember>(
    `/v1/households/${householdId}/members/${userId}/approve`,
  )
  return data
}

export const removeMember = async (householdId: string, userId: string): Promise<void> => {
  await client.delete(`/v1/households/${householdId}/members/${userId}`)
}

export const fetchHouseholdAnalytics = async (
  householdId: string,
  year: number,
  month: number,
): Promise<HouseholdAnalytics> => {
  const { data } = await client.get<HouseholdAnalytics>(
    `/v1/households/${householdId}/analytics`,
    { params: { year, month } },
  )
  return data
}
