import uuid
from sqlalchemy.orm import Session
from app.models.budget_models import Budget


def create(db: Session, budget: Budget) -> Budget:
    db.add(budget)
    db.flush()
    return budget


def get_by_id(db: Session, budget_id: uuid.UUID) -> Budget | None:
    return db.query(Budget).filter(Budget.id == budget_id).first()


def get_by_user(
    db: Session,
    user_id: uuid.UUID,
    month: int | None = None,
    year: int | None = None,
    currency: str | None = None,
) -> list[Budget]:
    q = db.query(Budget).filter(Budget.user_id == user_id)
    if month is not None:
        q = q.filter(Budget.month == month)
    if year is not None:
        q = q.filter(Budget.year == year)
    if currency is not None:
        q = q.filter(Budget.currency == currency)
    return q.order_by(Budget.year.desc(), Budget.month.desc()).all()


def get_duplicate(
    db: Session,
    user_id: uuid.UUID,
    category_id: uuid.UUID,
    month: int,
    year: int,
    currency: str,
) -> Budget | None:
    return db.query(Budget).filter(
        Budget.user_id   == user_id,
        Budget.category_id == category_id,
        Budget.month     == month,
        Budget.year      == year,
        Budget.currency  == currency,
    ).first()


def update(db: Session, budget: Budget, max_amount) -> Budget:
    budget.max_amount = max_amount
    db.flush()
    return budget


def delete(db: Session, budget: Budget) -> None:
    db.delete(budget)
    db.flush()
