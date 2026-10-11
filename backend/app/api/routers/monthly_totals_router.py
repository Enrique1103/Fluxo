import uuid
from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from sqlalchemy.orm import Session

from app.api.dependeces import get_current_user
from app.core.database import get_db
from app.models.users_models import User
from app.schemas.monthly_total_schema import (
    MonthlyTotalBulk, MonthlyTotalBulkResult, MonthlyTotalParseResult, MonthlyTotalResponse,
)
from app.services import monthly_total_service

router = APIRouter(prefix="/monthly-totals", tags=["Monthly Totals"])


@router.get("", response_model=list[MonthlyTotalResponse])
def list_monthly_totals(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return monthly_total_service.get_all(db, current_user)


@router.post("", response_model=MonthlyTotalBulkResult)
def upsert_monthly_totals(
    payload: MonthlyTotalBulk,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return monthly_total_service.upsert_many(db, current_user, payload)


@router.post("/parse", response_model=MonthlyTotalParseResult)
async def parse_monthly_totals_file(
    file: UploadFile = File(...),
    currency: str | None = Form(default=None),
    current_user: User = Depends(get_current_user),
):
    """Lee la plantilla completada y devuelve las filas. No guarda nada."""
    content = await file.read()
    return monthly_total_service.parse_upload(current_user, content, file.filename or "", currency)


@router.delete("/{total_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_monthly_total(
    total_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    monthly_total_service.delete(db, current_user, total_id)
