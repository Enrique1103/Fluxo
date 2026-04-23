import client from './client'

export interface LoginPayload {
  username: string
  password: string
}

export interface RegisterPayload {
  name: string
  email: string
  password: string
}

export interface TokenResponse {
  access_token: string
  token_type: string
  is_admin: boolean
}

export const login = async (payload: LoginPayload): Promise<TokenResponse> => {
  const form = new URLSearchParams()
  form.append('username', payload.username)
  form.append('password', payload.password)
  const { data } = await client.post<TokenResponse>('/v1/auth/login', form, {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  })
  return data
}

export const register = async (payload: RegisterPayload): Promise<void> => {
  await client.post('/v1/users/register', payload)
}
