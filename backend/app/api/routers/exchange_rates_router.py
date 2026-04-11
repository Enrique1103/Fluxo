import uuid
from typing import Annotated

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependeces import get_current_user, get_db
from app.models.users_models import User
from app.schemas.exchange_rate_schema import (
    ExchangeRateCreate,
    ExchangeRateUpdate,
    ExchangeRateResponse,
    ExchangeRateCheck,
)
from app.services import exchange_rate_service

router = APIRouter(prefix="/exchange-rates", tags=["exchange-rates"])


@router.get("", response_model=list[ExchangeRateResponse])
def list_rates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    rates = exchange_rate_service.get_all(db, current_user)
    return [ExchangeRateResponse.from_orm_model(r) for r in rates]


@router.get("/check", response_model=ExchangeRateCheck)
def check_rates(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return exchange_rate_service.check_current_month(db, current_user)


@router.post("", response_model=ExchangeRateResponse, status_code=201)
def create_rate(
    data: ExchangeRateCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    er = exchange_rate_service.create(db, current_user, data)
    return ExchangeRateResponse.from_orm_model(er)


@router.patch("/{rate_id}", response_model=ExchangeRateResponse)
def update_rate(
    rate_id: uuid.UUID,
    data: ExchangeRateUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    er = exchange_rate_service.update(db, current_user, rate_id, data)
    return ExchangeRateResponse.from_orm_model(er)


@router.delete("/{rate_id}", status_code=204)
def delete_rate(
    rate_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    exchange_rate_service.delete(db, current_user, rate_id)
