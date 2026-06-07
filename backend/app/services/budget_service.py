import uuid
from decimal import Decimal
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.crud import budget_crud
from app.models.budget_models import Budget
from app.models.transactions_models import Transaction, TransactionType
from app.models.accounts_models import Account
from app.models.categories_models import Category
from app.schemas.budget_schema import BudgetCreate, BudgetUpdate, BudgetResponse
from app.exceptions.budget_exceptions import (
    BudgetNotFound,
    BudgetAlreadyExists,
    UnauthorizedBudgetAccess,
)


def _compute_spent(db: Session, budget: Budget) -> Decimal:
    result = (
        db.query(func.sum(Transaction.amount))
        .join(Account, Transaction.account_id == Account.id)
        .filter(
            Transaction.user_id    == budget.user_id,
            Transaction.category_id == budget.category_id,
            Transaction.type       == TransactionType.EXPENSE,
            Transaction.is_deleted == False,
            func.extract("month", Transaction.date) == budget.month,
            func.extract("year",  Transaction.date) == budget.year,
            Account.currency == budget.currency,
        )
        .scalar()
    )
    return result or Decimal("0")


def _to_response(db: Session, budget: Budget) -> BudgetResponse:
    category_name = db.query(Category.name).filter(Category.id == budget.category_id).scalar() or ""
    spent = _compute_spent(db, budget)
    return BudgetResponse(
        id=budget.id,
        user_id=budget.user_id,
        category_id=budget.category_id,
        category_name=category_name,
        month=budget.month,
        year=budget.year,
        max_amount=budget.max_amount,
        currency=budget.currency,
        spent=spent,
    )


def create(db: Session, user_id: uuid.UUID, payload: BudgetCreate) -> BudgetResponse:
    # Check category ownership
    cat = db.query(Category).filter(
        Category.id == payload.category_id,
        Category.user_id == user_id,
    ).first()
    if not cat:
        from app.exceptions.category_exceptions import CategoryNotFound
        raise CategoryNotFound("Categoría no encontrada")

    # Check duplicate
    if budget_crud.get_duplicate(db, user_id, payload.category_id, payload.month, payload.year, payload.currency):
        raise BudgetAlreadyExists("Ya existe un presupuesto para esta categoría en este período")

    budget = Budget(
        user_id=user_id,
        category_id=payload.category_id,
        month=payload.month,
        year=payload.year,
        max_amount=payload.max_amount,
        currency=payload.currency,
    )
    try:
        budget_crud.create(db, budget)
        db.commit()
        db.refresh(budget)
        return _to_response(db, budget)
    except Exception:
        db.rollback()
        raise


def get_all(
    db: Session,
    user_id: uuid.UUID,
    month: int | None,
    year: int | None,
    currency: str | None,
) -> list[BudgetResponse]:
    budgets = budget_crud.get_by_user(db, user_id, month, year, currency)
    return [_to_response(db, b) for b in budgets]


def update(db: Session, user_id: uuid.UUID, budget_id: uuid.UUID, payload: BudgetUpdate) -> BudgetResponse:
    budget = budget_crud.get_by_id(db, budget_id)
    if not budget:
        raise BudgetNotFound("Presupuesto no encontrado")
    if budget.user_id != user_id:
        raise UnauthorizedBudgetAccess("Sin acceso a este presupuesto")
    try:
        budget_crud.update(db, budget, payload.max_amount)
        db.commit()
        db.refresh(budget)
        return _to_response(db, budget)
    except Exception:
        db.rollback()
        raise


def delete(db: Session, user_id: uuid.UUID, budget_id: uuid.UUID) -> None:
    budget = budget_crud.get_by_id(db, budget_id)
    if not budget:
        raise BudgetNotFound("Presupuesto no encontrado")
    if budget.user_id != user_id:
        raise UnauthorizedBudgetAccess("Sin acceso a este presupuesto")
    try:
        budget_crud.delete(db, budget)
        db.commit()
    except Exception:
        db.rollback()
        raise
