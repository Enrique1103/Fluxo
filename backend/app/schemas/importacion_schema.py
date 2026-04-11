from pydantic import BaseModel
from typing import Any, Optional
from uuid import UUID
from datetime import datetime


class DuplicateDetail(BaseModel):
    """Detalles de la transacción existente para comparar con el duplicado."""
    id: str
    fecha: str
    monto: float
    tipo: str
    concepto: str | None = None
    categoria: str | None = None
    descripcion: str | None = None


class MovimientoImportado(BaseModel):
    fecha: str = ""
    concepto: str | None = None
    monto: float = 0.0
    moneda: str = "UYU"
    categoria: str | None = None
    metodo_pago: str = "otro"
    descripcion: str | None = None
    estado: str  # 'validado' | 'duplicado' | 'error'
    import_hash: str | None = None
    error: str | None = None
    advertencia: str | None = None
    fila: int | None = None
    metadata: dict[str, Any] = {}
    household_id: UUID | None = None
    duplicate_detail: DuplicateDetail | None = None


class ParsearResponse(BaseModel):
    exitosos: int
    duplicados: int
    errores: int
    movimientos: list[MovimientoImportado]


class CuentaDetectada(BaseModel):
    nombre_zcuentas: str
    moneda: str
    fluxo_account_id: str | None = None
    fluxo_account_name: str | None = None
    score: float = 0.0


class DetectarResponse(BaseModel):
    banco: str
    cuentas_detectadas: list[CuentaDetectada] = []


class ConfirmarRequest(BaseModel):
    movimientos: list[MovimientoImportado]
    cuenta_id: UUID | None = None  # None para Zcuentas multi-cuenta (cada mov tiene cuenta_fluxo_id en metadata)
    banco: str
    nombre_archivo: str = "importacion"


class ConfirmarResponse(BaseModel):
    estado: str
    importados: int
    descartados: int
    importacion_id: str


class ImportacionHistorialItem(BaseModel):
    id: str
    fecha: datetime
    banco: str | None
    archivo: str | None
    total_procesados: int
    total_importados: int
    total_duplicados: int
    estado: str

    model_config = {"from_attributes": True}
