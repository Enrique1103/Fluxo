import uuid
from decimal import Decimal
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.crud import budget_crud
from app.models.budget_models import Budget
from app.models.transactions_models import Transaction, TransactionType
from app.models.accounts_models import Account
from app.models.categories_models import Category
from app.models.concepts_models import Concept
from app.schemas.budget_schema import BudgetCreate, BudgetUpdate, BudgetResponse, BudgetBulkSave
from app.exceptions.budget_exceptions import (
    BudgetNotFound,
    BudgetAlreadyExists,
    UnauthorizedBudgetAccess,
)


def _compute_spent(db: Session, budget: Budget) -> Decimal:
    # Presupuesto de concepto: solo ese concepto. De categoría: todos los conceptos
    # de la categoría (los movimientos guardan su categoría, así que se filtra por ella).
    scope = (
        Transaction.concept_id == budget.concept_id
        if budget.concept_id is not None
        else Transaction.category_id == budget.category_id
    )

    def _sum(*type_filter) -> Decimal:
        result = (
            db.query(func.sum(Transaction.amount))
            .join(Account, Transaction.account_id == Account.id)
            .filter(
                Transaction.user_id    == budget.user_id,
                scope,
                *type_filter,
                Transaction.is_deleted == False,
                func.extract("month", Transaction.date) == budget.month,
                func.extract("year",  Transaction.date) == budget.year,
                Account.currency == budget.currency,
            )
            .scalar()
        )
        return result or Decimal("0")

    # Gastos de la categoría menos los reintegros que volvieron a esa categoría
    spent = _sum(Transaction.type == TransactionType.EXPENSE) - _sum(
        Transaction.type == TransactionType.INCOME, Transaction.is_refund == True,  # noqa: E712
    )
    return max(spent, Decimal("0"))


def _to_response(db: Session, budget: Budget) -> BudgetResponse:
    category_name = db.query(Category.name).filter(Category.id == budget.category_id).scalar() or ""
    concept_name = (
        db.query(Concept.name).filter(Concept.id == budget.concept_id).scalar()
        if budget.concept_id is not None else None
    )
    spent = _compute_spent(db, budget)
    return BudgetResponse(
        id=budget.id,
        user_id=budget.user_id,
        category_id=budget.category_id,
        category_name=category_name,
        concept_id=budget.concept_id,
        concept_name=concept_name,
        month=budget.month,
        year=budget.year,
        max_amount=budget.max_amount,
        currency=budget.currency,
        spent=spent,
    )


def _resolve_target(
    db: Session, user_id: uuid.UUID, category_id: uuid.UUID, concept_id: uuid.UUID | None,
) -> uuid.UUID:
    """Valida que la categoría (y el concepto, si hay) sean del usuario.
    Devuelve la categoría efectiva: para un concepto, la categoría es la del concepto."""
    if concept_id is not None:
        concept = db.query(Concept).filter(Concept.id == concept_id, Concept.user_id == user_id).first()
        if not concept:
            from app.exceptions.concept_exceptions import ConceptNotFound
            raise ConceptNotFound("Concepto no encontrado")
        return concept.category_id
    cat = db.query(Category).filter(Category.id == category_id, Category.user_id == user_id).first()
    if not cat:
        from app.exceptions.category_exceptions import CategoryNotFound
        raise CategoryNotFound("Categoría no encontrada")
    return cat.id


def create(db: Session, user_id: uuid.UUID, payload: BudgetCreate) -> BudgetResponse:
    category_id = _resolve_target(db, user_id, payload.category_id, payload.concept_id)

    # Check duplicate
    if budget_crud.get_duplicate(db, user_id, category_id, payload.month, payload.year,
                                 payload.currency, payload.concept_id):
        what = "este concepto" if payload.concept_id else "esta categoría"
        raise BudgetAlreadyExists(f"Ya existe un presupuesto para {what} en este período")

    budget = Budget(
        user_id=user_id,
        category_id=category_id,
        concept_id=payload.concept_id,
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


def save_bulk(db: Session, user_id: uuid.UUID, payload: BudgetBulkSave) -> list[BudgetResponse]:
    """Guarda en un mes varios presupuestos juntos (la copia de otro mes, ya editada).
    Los que ya existen en ese mes se actualizan con el monto nuevo; el resto se crea.
    Todo o nada: si uno falla, no se guarda ninguno."""
    saved: list[Budget] = []
    seen: set[tuple] = set()
    try:
        for item in payload.items:
            category_id = _resolve_target(db, user_id, item.category_id, item.concept_id)
            key = (category_id if item.concept_id is None else None, item.concept_id, item.currency)
            if key in seen:
                continue
            seen.add(key)
            existing = budget_crud.get_duplicate(db, user_id, category_id, payload.month, payload.year,
                                                 item.currency, item.concept_id)
            if existing:
                budget_crud.update(db, existing, item.max_amount)
                saved.append(existing)
            else:
                budget = Budget(
                    user_id=user_id,
                    category_id=category_id,
                    concept_id=item.concept_id,
                    month=payload.month,
                    year=payload.year,
                    max_amount=item.max_amount,
                    currency=item.currency,
                )
                budget_crud.create(db, budget)
                saved.append(budget)
        db.commit()
    except Exception:
        db.rollback()
        raise
    for b in saved:
        db.refresh(b)
    return [_to_response(db, b) for b in saved]


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
