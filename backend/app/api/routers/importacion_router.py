import uuid
import json
from typing import Optional
from fastapi import APIRouter, File, UploadFile, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.api.dependeces import get_current_user, get_db
from app.models.users_models import User
from app.models.accounts_models import Account
from app.services.importacion_service import ImportacionService
from app.schemas.importacion_schema import (
    ParsearResponse,
    ConfirmarRequest,
    ConfirmarResponse,
    ImportacionHistorialItem,
    DetectarResponse,
)
from app.crud import importacion_crud

router = APIRouter(prefix="/importacion", tags=["importacion"])


@router.post("/detectar", response_model=DetectarResponse)
async def detectar_banco(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Detecta automáticamente el banco del archivo y, para Zcuentas,
    sugiere el mapeo de cuentas Zcuentas → cuentas Fluxo.
    No guarda nada en la BD.
    """
    archivo_bytes = await file.read()
    servicio = ImportacionService(db, current_user.id)
    try:
        resultado = servicio.detectar_banco(archivo_bytes)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    return DetectarResponse(**resultado)


@router.post("/parsear", response_model=ParsearResponse)
async def parsear_archivo(
    file: UploadFile = File(...),
    banco: str = Query(..., description="Banco detectado o seleccionado"),
    cuenta_id: Optional[uuid.UUID] = Query(None, description="UUID de la cuenta destino (opcional para Zcuentas)"),
    mapeo_cuentas: Optional[str] = Query(None, description="JSON: {nombre_cuenta_zcuentas: fluxo_account_id}"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Parsea un archivo bancario y devuelve la lista de movimientos normalizados.
    No guarda nada en la BD — solo análisis previo.
    Para Zcuentas multi-cuenta: omitir cuenta_id y pasar mapeo_cuentas.
    """
    if cuenta_id:
        account = db.query(Account).filter(
            Account.id == cuenta_id,
            Account.user_id == current_user.id,
            Account.is_deleted.is_(False),
        ).first()
        if not account:
            raise HTTPException(status_code=404, detail="Cuenta no encontrada")

    archivo_bytes = await file.read()
    nombre = file.filename or "importacion"

    mapeo: dict[str, str] | None = None
    if mapeo_cuentas:
        try:
            mapeo = json.loads(mapeo_cuentas)
        except Exception:
            raise HTTPException(status_code=422, detail="mapeo_cuentas debe ser JSON válido")

    servicio = ImportacionService(db, current_user.id)
    try:
        resultado = servicio.parsear_archivo(
            archivo_bytes=archivo_bytes,
            nombre_archivo=nombre,
            banco=banco,
            cuenta_id=cuenta_id,
            mapeo_cuentas=mapeo,
        )
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))

    return ParsearResponse(**resultado)


@router.post("/confirmar", response_model=ConfirmarResponse)
def confirmar_importacion(
    request: ConfirmarRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """
    Confirma e importa los movimientos validados.
    Guarda como transacciones normales y registra auditoría.
    Para Zcuentas multi-cuenta: cuenta_id puede ser None, cada movimiento
    trae metadata.cuenta_fluxo_id.
    """
    if request.cuenta_id:
        account = db.query(Account).filter(
            Account.id == request.cuenta_id,
            Account.user_id == current_user.id,
            Account.is_deleted.is_(False),
        ).first()
        if not account:
            raise HTTPException(status_code=404, detail="Cuenta no encontrada")

    servicio = ImportacionService(db, current_user.id)
    resultado = servicio.confirmar_importacion(
        movimientos=[m.model_dump() for m in request.movimientos],
        cuenta_id=request.cuenta_id,
        banco=request.banco,
        nombre_archivo=request.nombre_archivo,
    )

    return ConfirmarResponse(**resultado)


@router.get("/historial", response_model=list[ImportacionHistorialItem])
def historial_importaciones(
    skip: int = 0,
    limit: int = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Devuelve el historial de importaciones del usuario."""
    return importacion_crud.get_all_by_user(db, current_user.id, skip=skip, limit=limit)
