import client from './client'

// --- Types ---

export interface MonthlyStat {
  month: string   // "2025-01"
  ingresos: number
  gastos: number
  ahorro: number
}

export interface AccountSummary {
  id: string
  name: string
  type: string
  currency: string
  balance: number
  credit_limit: number | null
}

export interface CategoryBreakdown {
  category_name: string
  total: number
}

export interface Summary {
  net_worth: number
  total_assets: number
  total_debt: number
  income_this_month: number
  expense_this_month: number
  net_this_month: number
  accounts: AccountSummary[]
  expense_by_category: CategoryBreakdown[]
  first_tx_month: string | null
}

export interface FinGoal {
  id: string
  name: string
  target_amount: number
  allocation_pct: number
  current_amount: number | null
  deadline: string | null
  is_completed: boolean
}

// --- API calls ---

/** GET /api/v1/analytics/income-vs-expenses?months=N
 *  Returns Plotly figure — we extract x/y arrays manually.
 */
export const fetchIncomeVsExpenses = async (months = 24, months_ahead = 24, currency?: string): Promise<MonthlyStat[]> => {
  const { data } = await client.get('/v1/analytics/income-vs-expenses', {
    params: { months, months_ahead, ...(currency ? { currency } : {}) },
  })

  // Plotly structure: data[0] = Ingresos, data[1] = Egresos
  const traces: Array<{ x: string[]; y: number[] }> = data.data ?? []
  if (traces.length < 2) return []

  const labels: string[]   = traces[0].x ?? []
  const ingresos: number[] = traces[0].y ?? []
  const gastos: number[]   = traces[1].y ?? []

  return labels.map((month, i) => ({
    month,
    ingresos: ingresos[i] ?? 0,
    gastos:   gastos[i]   ?? 0,
    ahorro:   (ingresos[i] ?? 0) - (gastos[i] ?? 0),
  }))
}

/** GET /api/v1/summary */
export const fetchSummary = async (): Promise<Summary> => {
  const { data } = await client.get<Summary>('/v1/summary')
  return data
}

/** GET /api/v1/fin-goals */
export const fetchFinGoals = async (): Promise<FinGoal[]> => {
  const { data } = await client.get<FinGoal[]>('/v1/fin-goals')
  return data
}

/** PATCH /api/v1/fin-goals/{id} */
export const updateFinGoalAllocation = async (id: string, allocation_pct: number): Promise<FinGoal> => {
  const { data } = await client.patch<FinGoal>(`/v1/fin-goals/${id}`, { allocation_pct })
  return data
}

// --- Monthly Breakdown (3rd Dashboard) ---

export interface CategoryStat {
  name: string
  total: number
}

export interface DailyExpense {
  date: string  // "2025-03-15"
  total: number
}

export type PaymentMethod =
  | 'efectivo'
  | 'tarjeta_credito'
  | 'tarjeta_debito'
  | 'transferencia_bancaria'
  | 'billetera_digital'
  | 'otro'

export interface MonthlyTx {
  id: string
  date: string
  type: 'income' | 'expense' | 'transfer'
  amount: number
  category_name: string
  concept_name: string
  account_name: string
  description: string | null
  transfer_dest_name: string | null
  metodo_pago: PaymentMethod | null
  instalment_plan_id: string | null
}

export interface MonthlyBreakdown {
  income: number
  expenses: number
  savings: number
  categories: CategoryStat[]
  income_categories: CategoryStat[]
  daily_expenses: DailyExpense[]
  transactions: MonthlyTx[]
}

/** GET /api/v1/analytics/monthly-breakdown?year=N&month=N */
export const fetchMonthlyBreakdown = async (year: number, month: number, currency?: string): Promise<MonthlyBreakdown> => {
  const { data } = await client.get<MonthlyBreakdown>('/v1/analytics/monthly-breakdown', {
    params: { year, month, ...(currency ? { currency } : {}) },
  })
  return data
}

// --- Accounts ---
export interface Account {
  id: string
  name: string
  type: 'cash' | 'debit' | 'credit' | 'investment'
  currency: string
  balance: number
  credit_limit: number | null
  is_liability: boolean
  has_transactions: boolean
}

export const fetchAccounts = async (): Promise<Account[]> => {
  const { data } = await client.get<Account[]>('/v1/accounts')
  return data
}

export const createAccount = async (payload: {
  name: string; type: string; currency: string; balance: number; credit_limit?: number
}): Promise<Account> => {
  const { data } = await client.post<Account>('/v1/accounts', payload)
  return data
}

// --- Categories & Concepts ---
export interface Category {
  id: string; name: string; color: string | null; icon: string | null; is_system: boolean
}
export interface Concept {
  id: string; name: string; frequency_score: number; is_system: boolean
}

export const fetchCategories = async (): Promise<Category[]> => {
  const { data } = await client.get<Category[]>('/v1/categories')
  return data
}

export const fetchConcepts = async (): Promise<Concept[]> => {
  const { data } = await client.get<Concept[]>('/v1/concepts')
  return data
}

// --- Transactions ---
export const createTransaction = async (payload: {
  account_id: string; concept_id: string; category_id: string; amount: number
  type: 'income' | 'expense' | 'transfer'; date: string; description?: string
  transfer_to_account_id?: string; external_account_id?: string
  metodo_pago?: PaymentMethod; household_id?: string
}): Promise<void> => {
  await client.post('/v1/transactions', payload)
}

export const cancelInstalmentPlan = async (planId: string): Promise<void> => {
  await client.delete(`/v1/instalment-plans/${planId}`)
}

export const createInstalmentPlan = async (payload: {
  account_id: string; concept_id: string; category_id: string
  total_amount: number; n_cuotas: number; fecha_inicio: string
  description?: string; metodo_pago: PaymentMethod
}): Promise<void> => {
  await client.post('/v1/instalment-plans', payload)
}

// --- FinGoals full CRUD ---
export const createFinGoal = async (payload: {
  name: string; target_amount: number; allocation_pct: number; deadline?: string
}): Promise<FinGoal> => {
  const { data } = await client.post<FinGoal>('/v1/fin-goals', payload)
  return data
}

export const updateFinGoalFull = async (id: string, payload: {
  name?: string; target_amount?: number; allocation_pct?: number; deadline?: string | null
}): Promise<FinGoal> => {
  const { data } = await client.patch<FinGoal>(`/v1/fin-goals/${id}`, payload)
  return data
}

export const deleteFinGoal = async (id: string): Promise<void> => {
  await client.delete(`/v1/fin-goals/${id}`)
}

// --- User / Settings ---

export interface UserProfile {
  id: string
  name: string
  email: string
  currency_default: string
  is_active: boolean
  created_at: string
}

/** GET /api/v1/users/me */
export const fetchMe = async (): Promise<UserProfile> => {
  const { data } = await client.get<UserProfile>('/v1/users/me')
  return data
}

/** PATCH /api/v1/users/me — moneda por defecto */
export const updateCurrency = async (currency_default: string): Promise<UserProfile> => {
  const { data } = await client.patch<UserProfile>('/v1/users/me', { currency_default })
  return data
}

/** PATCH /api/v1/users/me — cambio de nombre */
export const updateName = async (name: string): Promise<UserProfile> => {
  const { data } = await client.patch<UserProfile>('/v1/users/me', { name })
  return data
}

/** PATCH /api/v1/users/me — cambio de contraseña */
export const updatePassword = async (current_password: string, new_password: string): Promise<UserProfile> => {
  const { data } = await client.patch<UserProfile>('/v1/users/me', { current_password, new_password })
  return data
}

/** POST /api/v1/auth/logout — revoca el token en el servidor */
export const logoutApi = async (): Promise<void> => {
  await client.post('/v1/auth/logout')
}

/** DELETE /api/v1/users/me — elimina la cuenta del usuario */
export const deleteUserAccount = async (password: string): Promise<void> => {
  await client.delete('/v1/users/me', { data: { password } })
}

// --- Account management ---
export const updateAccount = async (id: string, payload: { name?: string; type?: string; currency?: string; credit_limit?: number }): Promise<Account> => {
  const { data } = await client.patch<Account>(`/v1/accounts/${id}`, payload)
  return data
}

export const deleteAccount = async (id: string): Promise<void> => {
  await client.delete(`/v1/accounts/${id}`)
}

// --- Transaction management ---
export const updateTransaction = async (id: string, payload: {
  amount?: number; description?: string | null; date?: string; concept_id?: string; category_id?: string
  metodo_pago?: PaymentMethod
}): Promise<void> => {
  await client.patch(`/v1/transactions/${id}`, payload)
}

export const deleteTransaction = async (id: string): Promise<void> => {
  await client.delete(`/v1/transactions/${id}`)
}

// --- Category management ---
export interface CategoryCreate {
  name: string; icon?: string; color?: string
}
export const createCategory = async (payload: CategoryCreate): Promise<Category> => {
  const { data } = await client.post<Category>('/v1/categories', payload)
  return data
}
export const updateCategory = async (id: string, payload: Partial<CategoryCreate>): Promise<Category> => {
  const { data } = await client.patch<Category>(`/v1/categories/${id}`, payload)
  return data
}
export const deleteCategory = async (id: string): Promise<void> => {
  await client.delete(`/v1/categories/${id}`)
}

// --- Concept management ---
export const createConcept = async (payload: { name: string }): Promise<Concept> => {
  const { data } = await client.post<Concept>('/v1/concepts', payload)
  return data
}
export const updateConcept = async (id: string, payload: { name: string }): Promise<Concept> => {
  const { data } = await client.patch<Concept>(`/v1/concepts/${id}`, payload)
  return data
}
export const deleteConcept = async (id: string): Promise<void> => {
  await client.delete(`/v1/concepts/${id}`)
}

// --- External Accounts (cuentas de terceros) ---
export interface ExternalAccount {
  id: string
  user_id: string
  name: string
  account_number: string | null
  owner_name: string
  created_at: string
}

export const fetchExternalAccounts = async (): Promise<ExternalAccount[]> => {
  const { data } = await client.get<ExternalAccount[]>('/v1/external-accounts')
  return data
}

export const createExternalAccount = async (payload: {
  name: string
  account_number?: string
  owner_name: string
}): Promise<ExternalAccount> => {
  const { data } = await client.post<ExternalAccount>('/v1/external-accounts', payload)
  return data
}

// --- Exchange Rates ---

export interface ExchangeRate {
  id: string
  from_currency: string
  to_currency: string
  rate: number
  year: number
  month: number
}

export interface ExchangeRateCheck {
  has_all_rates: boolean
  missing_pairs: string[]
  current_year: number
  current_month: number
}

export const fetchExchangeRates = async (): Promise<ExchangeRate[]> => {
  const { data } = await client.get<ExchangeRate[]>('/v1/exchange-rates')
  return data
}

export const checkExchangeRates = async (): Promise<ExchangeRateCheck> => {
  const { data } = await client.get<ExchangeRateCheck>('/v1/exchange-rates/check')
  return data
}

export const createExchangeRate = async (payload: {
  from_currency: string; to_currency: string; rate: number; year: number; month: number
}): Promise<ExchangeRate> => {
  const { data } = await client.post<ExchangeRate>('/v1/exchange-rates', payload)
  return data
}

export const updateExchangeRate = async (id: string, rate: number): Promise<ExchangeRate> => {
  const { data } = await client.patch<ExchangeRate>(`/v1/exchange-rates/${id}`, { rate })
  return data
}

export const deleteExchangeRate = async (id: string): Promise<void> => {
  await client.delete(`/v1/exchange-rates/${id}`)
}

// --- Patrimonio ---

export interface MonthlyPatrimonio {
  month: string
  value: number | null
  missing_rate: boolean
  missing_currencies: string[]
}

export const fetchPatrimonio = async (
  months = 24,
  months_ahead = 6,
  currency?: string,
): Promise<MonthlyPatrimonio[]> => {
  const { data } = await client.get<MonthlyPatrimonio[]>('/v1/analytics/patrimonio', {
    params: { months, months_ahead, ...(currency ? { currency } : {}) },
  })
  return data
}
