import axios from 'axios'
import { useAuthStore } from '../store/authStore'

const client = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api',
})

client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token
  if (token) {
    config.headers.Authorization = `Bearer ${token}`
  }
  return config
})

client.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      const { token, logout } = useAuthStore.getState()
      if (token) {
        // Token expirado o revocado — limpiar sesión.
        // PrivateRoute detecta token=null y redirige a /login sin hard reload.
        logout()
      }
    }
    return Promise.reject(error)
  }
)

export default client

// ── Servidor dormido (Render free plan) ─────────────────────────────────────────
// Tras ~15 min sin uso Render apaga el backend y tarda hasta un minuto en volver.
// Mientras tanto las peticiones fallan sin respuesta (o con 502/503/504).

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** true si el error parece "servidor apagado / despertando" y no un error real de la API. */
export const isServerAsleep = (err: any): boolean => {
  const status = err?.response?.status
  return !err?.response || status === 502 || status === 503 || status === 504
}

/** Hace un ping al backend para que empiece a despertar. No lanza errores. */
export const wakeServer = (): Promise<boolean> =>
  client.get('/v1/health', { timeout: 20_000 }).then(() => true, () => false)

/** Espera a que el backend responda, hasta `maxMs`. */
export const waitForServer = async (maxMs = 90_000): Promise<boolean> => {
  const deadline = Date.now() + maxMs
  while (Date.now() < deadline) {
    if (await wakeServer()) return true
    await sleep(3_000)
  }
  return false
}

/**
 * Ejecuta `fn`; si falla porque el servidor está dormido, avisa con `onWaking`,
 * espera a que despierte y la reintenta una vez.
 */
export const withServerWake = async <T>(fn: () => Promise<T>, onWaking?: () => void): Promise<T> => {
  try {
    return await fn()
  } catch (err) {
    if (!isServerAsleep(err)) throw err
    onWaking?.()
    if (!(await waitForServer())) throw err
    return fn()
  }
}
