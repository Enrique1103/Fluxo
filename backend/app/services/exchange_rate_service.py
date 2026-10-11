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
        str(a.currency)
        for a in accounts
        if str(a.currency) != str(user.currency_default)
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

    # Tasa del mes exacto, en cualquier sentido (una inversa del mes gana a una directa vieja)
    exact = exchange_rate_crud.get_for_month(db, user_id, from_currency, to_currency, year, month)
    if exact:
        return Decimal(str(exact.rate))
    exact_inv = exchange_rate_crud.get_for_month(db, user_id, to_currency, from_currency, year, month)
    if exact_inv:
        return Decimal("1") / Decimal(str(exact_inv.rate))

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


def _closest(db: Session, user_id: uuid.UUID, frm: str, to: str, year: int, month: int, before: bool):
    """(clave_mes, tasa frm→to) de la tasa más cercana antes/después del mes, en cualquier sentido del par."""
    if before:
        y, m = (year - 1, 12) if month == 1 else (year, month - 1)
        direct = exchange_rate_crud.get_most_recent_for_pair_up_to(db, user_id, frm, to, y, m)
        inverse = exchange_rate_crud.get_most_recent_for_pair_up_to(db, user_id, to, frm, y, m)
    else:
        y, m = (year + 1, 1) if month == 12 else (year, month + 1)
        direct = exchange_rate_crud.get_earliest_for_pair_from(db, user_id, frm, to, y, m)
        inverse = exchange_rate_crud.get_earliest_for_pair_from(db, user_id, to, frm, y, m)
    options = []
    if direct:
        options.append((direct.year * 12 + direct.month, Decimal(str(direct.rate))))
    if inverse:
        options.append((inverse.year * 12 + inverse.month, Decimal("1") / Decimal(str(inverse.rate))))
    if not options:
        return None
    # la más cercana al mes pedido
    return max(options) if before else min(options)


def get_rate_nearest(
    db: Session,
    user_id: uuid.UUID,
    from_currency: str,
    to_currency: str,
    year: int,
    month: int,
) -> Decimal | None:
    """
    Tasa para convertir montos de un mes:
      1. la tasa de ese mes (en cualquier sentido del par);
      2. si no hay, el promedio entre la tasa anterior más cercana y la siguiente más cercana;
      3. si solo hay una de las dos, esa.
    None solo si el par no tiene ninguna tasa cargada.
    """
    if from_currency == to_currency:
        return Decimal("1")
    exact = exchange_rate_crud.get_for_month(db, user_id, from_currency, to_currency, year, month)
    if exact:
        return Decimal(str(exact.rate))
    exact_inv = exchange_rate_crud.get_for_month(db, user_id, to_currency, from_currency, year, month)
    if exact_inv:
        return Decimal("1") / Decimal(str(exact_inv.rate))

    prev = _closest(db, user_id, from_currency, to_currency, year, month, before=True)
    nxt = _closest(db, user_id, from_currency, to_currency, year, month, before=False)
    if prev and nxt:
        # El promedio se hace en el sentido "1 USD = 40 UYU" (tasa > 1) para que
        # UYU→USD sea exactamente la inversa de USD→UYU
        if prev[1] < 1:
            return Decimal("1") / ((Decimal("1") / prev[1] + Decimal("1") / nxt[1]) / 2)
        return (prev[1] + nxt[1]) / 2
    if prev:
        return prev[1]
    if nxt:
        return nxt[1]
    return None
