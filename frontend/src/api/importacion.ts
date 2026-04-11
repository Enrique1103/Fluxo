import client from './client'

// --- Types ---

export interface DuplicateDetail {
  id: string
  fecha: string
  monto: number
  tipo: string
  concepto: string | null
  categoria: string | null
  descripcion: string | null
}

export interface MovimientoImportado {
  fecha: string
  concepto: string
  monto: number
  moneda: string
  categoria: string | null
  metodo_pago: string
  descripcion: string | null
  estado: 'validado' | 'duplicado' | 'error'
  import_hash: string | null
  error: string | null
  advertencia: string | null
  fila: number | null
  metadata: Record<string, unknown>
  household_id?: string | null
  duplicate_detail?: DuplicateDetail | null
}

export interface ParsearResponse {
  exitosos: number
  duplicados: number
  errores: number
  movimientos: MovimientoImportado[]
}

export interface CuentaDetectada {
  nombre_zcuentas: string
  moneda: string
  fluxo_account_id: string | null
  fluxo_account_name: string | null
  score: number
}

export interface DetectarResponse {
  banco: string
  cuentas_detectadas: CuentaDetectada[]
}

export interface ConfirmarRequest {
  movimientos: MovimientoImportado[]
  cuenta_id: string | null
  banco: string
  nombre_archivo: string
}

export interface ConfirmarResponse {
  estado: string
  importados: number
  descartados: number
  importacion_id: string
}

export interface ImportacionHistorialItem {
  id: string
  fecha: string
  banco: string | null
  archivo: string | null
  total_procesados: number
  total_importados: number
  total_duplicados: number
  estado: string
}

// --- API calls ---

export const detectarBanco = async (file: File): Promise<DetectarResponse> => {
  const form = new FormData()
  form.append('file', file)
  const { data } = await client.post<DetectarResponse>('/v1/importacion/detectar', form)
  return data
}

export const parsearArchivo = async (
  file: File,
  banco: string,
  cuenta_id: string | null,
  mapeo_cuentas?: Record<string, string>,
): Promise<ParsearResponse> => {
  const form = new FormData()
  form.append('file', file)
  const params: Record<string, string> = { banco }
  if (cuenta_id) params.cuenta_id = cuenta_id
  if (mapeo_cuentas && Object.keys(mapeo_cuentas).length > 0) {
    params.mapeo_cuentas = JSON.stringify(mapeo_cuentas)
  }
  const { data } = await client.post<ParsearResponse>(
    '/v1/importacion/parsear',
    form,
    { params },
  )
  return data
}

export const confirmarImportacion = async (
  payload: ConfirmarRequest,
): Promise<ConfirmarResponse> => {
  const { data } = await client.post<ConfirmarResponse>('/v1/importacion/confirmar', payload)
  return data
}

export const fetchHistorialImportaciones = async (
  skip = 0,
  limit = 20,
): Promise<ImportacionHistorialItem[]> => {
  const { data } = await client.get<ImportacionHistorialItem[]>('/v1/importacion/historial', {
    params: { skip, limit },
  })
  return data
}
