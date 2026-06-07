import client from './client'

export type ReviewType =
  | 'innecesario'
  | 'monto_alto'
  | 'categoria_incorrecta'
  | 'no_es_del_hogar'
  | 'sospechoso'
  | 'pregunta'
  | 'otra'

export type ReviewStatus = 'pendiente' | 'respondida' | 'descartada' | 'resuelta'

export interface Review {
  id: string
  transaction_id: string
  household_id: string
  flagged_by_user_id: string
  flag_type: ReviewType
  comment: string | null
  status: ReviewStatus
  created_at: string
  response_comment: string | null
  response_at: string | null
}

export const FLAG_TYPE_LABELS: Record<ReviewType, string> = {
  innecesario:          'Gasto innecesario',
  monto_alto:           'Monto elevado',
  categoria_incorrecta: 'Categoría incorrecta',
  no_es_del_hogar:      'No es del hogar',
  sospechoso:           'Gasto sospechoso',
  pregunta:             'Tengo una pregunta',
  otra:                 'Otra razón',
}

export const STATUS_LABELS: Record<ReviewStatus, string> = {
  pendiente:  'Pendiente',
  respondida: 'Respondida',
  descartada: 'Descartada',
  resuelta:   'Resuelta',
}

export const fetchReviews = async (
  householdId: string,
  status?: ReviewStatus,
): Promise<Review[]> => {
  const { data } = await client.get<Review[]>(
    `/v1/households/${householdId}/reviews`,
    status ? { params: { status } } : undefined,
  )
  return data
}

export const createReview = async (payload: {
  transaction_id: string
  household_id: string
  flag_type: ReviewType
  comment?: string
}): Promise<Review> => {
  const { data } = await client.post<Review>(
    `/v1/households/${payload.household_id}/reviews`,
    payload,
  )
  return data
}

export const respondReview = async (
  householdId: string,
  reviewId: string,
  payload: { status: ReviewStatus; response_comment?: string },
): Promise<Review> => {
  const { data } = await client.patch<Review>(
    `/v1/households/${householdId}/reviews/${reviewId}`,
    payload,
  )
  return data
}

export const deleteReview = async (householdId: string, reviewId: string): Promise<void> => {
  await client.delete(`/v1/households/${householdId}/reviews/${reviewId}`)
}
