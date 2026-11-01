import client from './client'

// --- Types ---

export type SplitType = 'equal' | 'proportional'
export type AnalysisLevel = 'expenses_only' | 'expenses_and_goals' | 'full'
export type MemberRole = 'admin' | 'member'
export type MemberStatus = 'pending' | 'active'
export type InviteStatus = 'pending' | 'used' | 'expired'

export interface Household {
  id: string
  name: string
  base_currency: string
  split_type: SplitType
  analysis_level: AnalysisLevel
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

/** Pago registrado del balanceo del mes */
export interface SettlementPayment {
  id: string
  from_user_id: string
  from_user_name: string
  to_user_id: string
  to_user_name: string
  amount: number
  currency: string
  paid_date: string
  comment: string | null
  /** El que cobra ya indicó a qué cuenta entró */
  confirmed: boolean
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
  account_name: string
  description?: string | null
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

export interface ConceptBreakdown {
  concept_name: string
  total: number
  currency: string
  transaction_count: number
}

export interface MemberIncome {
  user_id: string
  user_name: string
  amount: number
  currency: string
}

export interface MemberTransaction {
  transaction_id: string
  date: string
  type: 'income' | 'expense'
  concept_name: string
  category_name: string
  amount: number
  currency: string
  user_id: string
  user_name: string
  account_name: string
  description?: string | null
}

export interface MemberTransfer {
  id: string
  household_id: string
  from_user_id: string
  from_user_name: string
  to_user_id: string
  to_user_name: string
  amount: number
  currency: string
  date: string
  description: string | null
  created_at: string
}

export interface HouseholdAnalytics {
  household_id: string
  period: string
  split_type: SplitType
  members: MemberContribution[]
  shared_expenses: SharedExpense[]
  settlement: SettlementItem[]
  settlement_payments?: SettlementPayment[]
  alerts: HouseholdAlert[]
  expense_by_category: CategoryBreakdown[]
  total_shared: number
  base_currency: string
  daily_average: number
  top_concepts: ConceptBreakdown[]
  expenses_by_day: Record<string, number>
  prev_month_total: number
  prev_month_change_pct: number | null
  analysis_level: AnalysisLevel
  member_incomes: MemberIncome[] | null
  net_savings: number | null
  total_group_income: number | null
  member_transactions: MemberTransaction[] | null
  member_transfers?: MemberTransfer[]
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
  analysis_level?: AnalysisLevel
}): Promise<Household> => {
  const { data } = await client.post<Household>('/v1/households', payload)
  return data
}

export const updateHousehold = async (
  id: string,
  payload: { name?: string; base_currency?: string },
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

// --- Balanceo del mes ---
/** El que debe registra el pago: el monto lo calcula Hogar; se le carga el gasto "Balanceo del Hogar" */
export const paySettlement = async (householdId: string, payload: {
  year: number; month: number; to_user_id: string; account_id: string; date: string; comment?: string
}): Promise<void> => {
  await client.post(`/v1/households/${householdId}/settlements`, payload)
}

/** El que cobra confirma a qué cuenta entró: se le carga el reintegro "Reintegro del Hogar" */
export const confirmSettlement = async (householdId: string, settlementId: string, payload: {
  account_id: string; date?: string
}): Promise<void> => {
  await client.post(`/v1/households/${householdId}/settlements/${settlementId}/confirm`, payload)
}

/** Crea una transferencia entre miembros: egreso en cuenta del emisor + ingreso en cuenta del receptor */
export const createMemberTransfer = async (householdId: string, payload: {
  to_user_id: string
  from_account_id: string
  to_account_id: string
  amount: number
  currency: string
  date: string
  description?: string
}): Promise<MemberTransfer> => {
  const { data } = await client.post<MemberTransfer>(`/v1/households/${householdId}/member-transfers`, payload)
  return data
}

// --- Transferencias pendientes ---

export interface PendingMemberTransfer {
  id: string
  household_id: string
  from_user_id: string
  from_user_name: string
  to_user_id: string
  to_user_name: string
  amount: number
  currency: string
  date: string
  description: string | null
  created_at: string
}

/** El emisor inicia una transferencia sin elegir la cuenta del receptor */
export const createPendingMemberTransfer = async (householdId: string, payload: {
  to_user_id: string
  from_account_id: string
  amount: number
  currency: string
  date: string
  description?: string
}): Promise<PendingMemberTransfer> => {
  const { data } = await client.post<PendingMemberTransfer>(`/v1/households/${householdId}/pending-member-transfers`, payload)
  return data
}

/** Lista las transferencias pendientes del hogar (emisor y receptor las ven) */
export const fetchPendingMemberTransfers = async (householdId: string): Promise<PendingMemberTransfer[]> => {
  const { data } = await client.get<PendingMemberTransfer[]>(`/v1/households/${householdId}/pending-member-transfers`)
  return data
}

/** El receptor acepta eligiendo su cuenta destino */
export const acceptPendingMemberTransfer = async (
  householdId: string, pendingId: string, toAccountId: string,
): Promise<MemberTransfer> => {
  const { data } = await client.post<MemberTransfer>(
    `/v1/households/${householdId}/pending-member-transfers/${pendingId}/accept`,
    { to_account_id: toAccountId },
  )
  return data
}

/** Cancela una transferencia pendiente */
export const cancelPendingMemberTransfer = async (householdId: string, pendingId: string): Promise<void> => {
  await client.delete(`/v1/households/${householdId}/pending-member-transfers/${pendingId}`)
}

/** Edita monto, moneda, fecha o descripción de una transferencia entre miembros */
export const updateMemberTransfer = async (householdId: string, transferId: string, payload: {
  amount?: number
  currency?: string
  date?: string
  description?: string
}): Promise<MemberTransfer> => {
  const { data } = await client.patch<MemberTransfer>(`/v1/households/${householdId}/member-transfers/${transferId}`, payload)
  return data
}

/** Elimina una transferencia entre miembros y sus transacciones */
export const deleteMemberTransfer = async (householdId: string, transferId: string): Promise<void> => {
  await client.delete(`/v1/households/${householdId}/member-transfers/${transferId}`)
}

/** Devuelve las cuentas activas de un miembro del hogar */
export const fetchMemberAccounts = async (householdId: string, userId: string): Promise<{
  id: string; name: string; type: string; currency: string; balance: number
}[]> => {
  const { data } = await client.get(`/v1/households/${householdId}/members/${userId}/accounts`)
  return data
}
