import uuid
from decimal import Decimal
from sqlalchemy import or_, and_
from sqlalchemy.orm import Session
from app.models.monthly_total_models import MonthlyTotal


def get_all_by_user(db: Session, user_id: uuid.UUID) -> list[MonthlyTotal]:
    return (
        db.query(MonthlyTotal)
        .filter(MonthlyTotal.user_id == user_id)
        .order_by(MonthlyTotal.year.desc(), MonthlyTotal.month.desc(), MonthlyTotal.currency)
        .all()
    )


def get_in_range(
    db: Session, user_id: uuid.UUID, from_year: int, from_month: int, to_year: int, to_month: int
) -> list[MonthlyTotal]:
    return (
        db.query(MonthlyTotal)
        .filter(
            MonthlyTotal.user_id == user_id,
            or_(MonthlyTotal.year > from_year, and_(MonthlyTotal.year == from_year, MonthlyTotal.month >= from_month)),
            or_(MonthlyTotal.year < to_year, and_(MonthlyTotal.year == to_year, MonthlyTotal.month <= to_month)),
        )
        .all()
    )


def get_one(db: Session, user_id: uuid.UUID, year: int, month: int, currency: str) -> MonthlyTotal | None:
    return (
        db.query(MonthlyTotal)
        .filter(
            MonthlyTotal.user_id == user_id,
            MonthlyTotal.year == year,
            MonthlyTotal.month == month,
            MonthlyTotal.currency == currency,
        )
        .first()
    )


def get_by_id(db: Session, total_id: uuid.UUID) -> MonthlyTotal | None:
    return db.query(MonthlyTotal).filter(MonthlyTotal.id == total_id).first()


def create(
    db: Session, user_id: uuid.UUID, year: int, month: int, currency: str, income: Decimal, expense: Decimal
) -> MonthlyTotal:
    mt = MonthlyTotal(user_id=user_id, year=year, month=month, currency=currency, income=income, expense=expense)
    db.add(mt)
    db.flush()
    return mt


def update_amounts(db: Session, mt: MonthlyTotal, income: Decimal, expense: Decimal) -> MonthlyTotal:
    mt.income = income
    mt.expense = expense
    db.flush()
    return mt


def delete(db: Session, mt: MonthlyTotal) -> None:
    db.delete(mt)
    db.flush()
