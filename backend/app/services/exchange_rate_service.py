import uuid
from datetime import date
from decimal import Decimal
from sqlalchemy.orm import Session

from app.crud import exchange_rate_crud, account_crud
from app.exceptions.exchange_rate_exceptions import (
    ExchangeRateNotFound,
    ExchangeRateAlreadyExists,
    ExchangeRateMissing,
    UnauthorizedExchangeRateAccess,
)
from app.models.exchange_rate_models import ExchangeRate
from app.models.users_models import User
from app.schemas.exchange_rate_schema import (
    ExchangeRateCreate,
    ExchangeRateUpdate,
    ExchangeRateCheck,
)


def get_all(db: Session, user: User) -> list[ExchangeRate]:
    return exchange_rate_crud.get_by_user(db, user.id)


def create(db: Session, user: User, data: ExchangeRateCreate) -> ExchangeRate:
    existing = exchange_rate_crud.get_for_month(
        db, user.id, data.from_currency, data.to_currency, data.year, data.month
    )
    if existing:
        raise ExchangeRateAlreadyExists(
            f"Ya existe una tasa para {data.from_currency}→{data.to_currency} "
            f"en {data.year}-{data.month:02d}. Usá PATCH para actualizarla."
        )
    try:
        er = exchange_rate_crud.create(db, user.id, data)
        db.commit()
        db.refresh(er)
        return er
    except Exception:
        db.rollback()
        raise


def update(db: Session, user: User, rate_id: uuid.UUID, data: ExchangeRateUpdate) -> ExchangeRate:
    er = exchange_rate_crud.get_by_id(db, rate_id)
    if not er:
        raise ExchangeRateNotFound("Tasa de cambio no encontrada")
    if er.user_id != user.id:
        raise UnauthorizedExchangeRateAccess("No tenés acceso a esta tasa")
    try:
        er = exchange_rate_crud.update_rate(db, er, data.rate)
        db.commit()
        db.refresh(er)
        return er
    except Exception:
        db.rollback()
        raise


def delete(db: Session, user: User, rate_id: uuid.UUID) -> None:
    er = exchange_rate_crud.get_by_id(db, rate_id)
    if not er:
        raise ExchangeRateNotFound("Tasa de cambio no encontrada")
    if er.user_id != user.id:
        raise UnauthorizedExchangeRateAccess("No tenés acceso a esta tasa")
    try:
        exchange_rate_crud.delete(db, er)
        db.commit()
    except Exception:
        db.rollback()
        raise


def check_current_month(db: Session, user: User) -> ExchangeRateCheck:
    """Check whether all required exchange rates for the current month exist."""
    today = date.today()
    accounts = account_crud.get_all_by_user(db, user.id)

    foreign_currencies = {
        a.currency.value
        for a in accounts
        if a.currency.value != str(user.currency_default)
    }

    missing_pairs: list[str] = []
    for fc in sorted(foreign_currencies):
        # Buscar par directo (fc → default) o par inverso (default → fc)
        rate = exchange_rate_crud.get_most_recent_for_pair_up_to(
            db, user.id, fc, str(user.currency_default), today.year, today.month
        )
        if not rate:
            rate = exchange_rate_crud.get_most_recent_for_pair_up_to(
                db, user.id, str(user.currency_default), fc, today.year, today.month
            )
        if not rate:
            missing_pairs.append(f"{fc}↔{user.currency_default}")

    return ExchangeRateCheck(
        has_all_rates=len(missing_pairs) == 0,
        missing_pairs=missing_pairs,
        current_year=today.year,
        current_month=today.month,
    )


def get_rate_for_month(
    db: Session,
    user_id: uuid.UUID,
    from_currency: str,
    to_currency: str,
    year: int,
    month: int,
) -> Decimal | None:
    """
    Returns the exchange rate for a given month.
    - Same currency → 1.
    - Falls back to the most recent previous month if the exact month is missing.
    - Supports inverse: if USD→UYU is stored, asking UYU→USD returns 1/rate.
    """
    if from_currency == to_currency:
        return Decimal("1")

    # Direct pair — exact month or most recent past month
    er = exchange_rate_crud.get_most_recent_for_pair_up_to(
        db, user_id, from_currency, to_currency, year, month
    )
    if er:
        return Decimal(str(er.rate))

    # Inverse pair — same fallback logic
    er_inv = exchange_rate_crud.get_most_recent_for_pair_up_to(
        db, user_id, to_currency, from_currency, year, month
    )
    if er_inv:
        return Decimal("1") / Decimal(str(er_inv.rate))

    return None
