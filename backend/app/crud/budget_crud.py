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
    concept_id: uuid.UUID | None = None,
) -> Budget | None:
    q = db.query(Budget).filter(
        Budget.user_id   == user_id,
        Budget.month     == month,
        Budget.year      == year,
        Budget.currency  == currency,
    )
    if concept_id is None:
        q = q.filter(Budget.category_id == category_id, Budget.concept_id.is_(None))
    else:
        q = q.filter(Budget.concept_id == concept_id)
    return q.first()


def update(db: Session, budget: Budget, max_amount, category_id=None, extra_category_ids=None, name=None) -> Budget:
    import uuid as _uuid
    budget.max_amount = max_amount
    if category_id is not None:
        budget.category_id = category_id if isinstance(category_id, _uuid.UUID) else _uuid.UUID(str(category_id))
    if extra_category_ids is not None:
        from app.models.budget_models import BudgetCategory
        for ec in list(budget.extra_categories):
            db.delete(ec)
        db.flush()
        for cat_id in extra_category_ids:
            db.add(BudgetCategory(budget_id=budget.id, category_id=cat_id if isinstance(cat_id, _uuid.UUID) else _uuid.UUID(str(cat_id))))
    if name is not None:
        budget.name = name if name.strip() else None
    db.flush()
    return budget


def delete(db: Session, budget: Budget) -> None:
    db.delete(budget)
    db.flush()
