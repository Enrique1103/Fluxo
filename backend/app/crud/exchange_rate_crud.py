import uuid
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session
from app.models.exchange_rate_models import ExchangeRate
from app.schemas.exchange_rate_schema import ExchangeRateCreate


def get_by_id(db: Session, rate_id: uuid.UUID) -> ExchangeRate | None:
    return db.query(ExchangeRate).filter(ExchangeRate.id == rate_id).first()


def get_by_user(db: Session, user_id: uuid.UUID) -> list[ExchangeRate]:
    return (
        db.query(ExchangeRate)
        .filter(ExchangeRate.user_id == user_id)
        .order_by(ExchangeRate.year.desc(), ExchangeRate.month.desc())
        .all()
    )


def get_for_month(
    db: Session,
    user_id: uuid.UUID,
    from_currency: str,
    to_currency: str,
    year: int,
    month: int,
) -> ExchangeRate | None:
    return db.query(ExchangeRate).filter(
        ExchangeRate.user_id == user_id,
        ExchangeRate.from_currency == from_currency,
        ExchangeRate.to_currency == to_currency,
        ExchangeRate.year == year,
        ExchangeRate.month == month,
    ).first()


def get_most_recent_for_pair_up_to(
    db: Session,
    user_id: uuid.UUID,
    from_currency: str,
    to_currency: str,
    year: int,
    month: int,
) -> ExchangeRate | None:
    """Most recent stored rate for a pair, up to and including year/month."""
    return (
        db.query(ExchangeRate)
        .filter(
            ExchangeRate.user_id == user_id,
            ExchangeRate.from_currency == from_currency,
            ExchangeRate.to_currency == to_currency,
            or_(
                ExchangeRate.year < year,
                and_(ExchangeRate.year == year, ExchangeRate.month <= month),
            ),
        )
        .order_by(ExchangeRate.year.desc(), ExchangeRate.month.desc())
        .first()
    )


def get_all_for_pair(
    db: Session,
    user_id: uuid.UUID,
    from_currency: str,
    to_currency: str,
) -> list[ExchangeRate]:
    """All historical rates for a currency pair, oldest first."""
    return (
        db.query(ExchangeRate)
        .filter(
            ExchangeRate.user_id == user_id,
            ExchangeRate.from_currency == from_currency,
            ExchangeRate.to_currency == to_currency,
        )
        .order_by(ExchangeRate.year.asc(), ExchangeRate.month.asc())
        .all()
    )


def create(db: Session, user_id: uuid.UUID, data: ExchangeRateCreate) -> ExchangeRate:
    er = ExchangeRate(
        user_id=user_id,
        from_currency=data.from_currency,
        to_currency=data.to_currency,
        rate=data.rate,
        year=data.year,
        month=data.month,
    )
    db.add(er)
    db.flush()
    return er


def update_rate(db: Session, er: ExchangeRate, new_rate: Decimal) -> ExchangeRate:
    er.rate = new_rate
    er.updated_at = datetime.now(timezone.utc)
    db.flush()
    return er


def delete(db: Session, er: ExchangeRate) -> None:
    db.delete(er)
    db.flush()
