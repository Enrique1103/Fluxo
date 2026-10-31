import uuid
from decimal import Decimal
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from app.crud import budget_crud
from app.models.budget_models import Budget, BudgetCategory
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
    # Presupuesto de concepto: solo ese concepto. De categoría(s): todos los conceptos
    # de la(s) categoría(s).
    if budget.concept_id is not None:
        scope = Transaction.concept_id == budget.concept_id
    else:
        cat_ids = budget.category_ids
        if len(cat_ids) == 1:
            scope = Transaction.category_id == cat_ids[0]
        else:
            scope = Transaction.category_id.in_(cat_ids)

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
    extra_ids = [x.category_id for x in budget.extra_categories]
    extra_names: list[str] = []
    if extra_ids:
        rows = db.query(Category.id, Category.name).filter(Category.id.in_(extra_ids)).all()
        name_map = {r.id: r.name for r in rows}
        extra_names = [name_map.get(cid, "") for cid in extra_ids]
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
        extra_category_ids=extra_ids,
        extra_category_names=extra_names,
        concept_id=budget.concept_id,
        concept_name=concept_name,
        name=budget.name,
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


def _resolve_extras(db: Session, user_id: uuid.UUID, extra_ids: list[uuid.UUID]) -> list[uuid.UUID]:
    """Valida que todas las categorías extra sean del usuario."""
    if not extra_ids:
        return []
    found = db.query(Category.id).filter(Category.id.in_(extra_ids), Category.user_id == user_id).all()
    found_ids = {r.id for r in found}
    missing = [cid for cid in extra_ids if cid not in found_ids]
    if missing:
        from app.exceptions.category_exceptions import CategoryNotFound
        raise CategoryNotFound("Categoría no encontrada")
    return list(dict.fromkeys(cid for cid in extra_ids))  # dedup preserving order


def _check_cat_budget_overlap(
    db: Session, user_id: uuid.UUID, all_cat_ids: set[uuid.UUID],
    month: int, year: int, currency: str, exclude_id: uuid.UUID | None = None,
) -> None:
    """Impide que haya dos presupuestos de categoría cuyo conjunto de categorías se solape."""
    q = db.query(Budget).filter(
        Budget.user_id == user_id, Budget.month == month, Budget.year == year,
        Budget.currency == currency, Budget.concept_id.is_(None),
        or_(
            Budget.category_id.in_(all_cat_ids),
            Budget.extra_categories.any(BudgetCategory.category_id.in_(all_cat_ids)),
        ),
    )
    if exclude_id:
        q = q.filter(Budget.id != exclude_id)
    dup = q.first()
    if dup:
        raise BudgetAlreadyExists("Ya hay un presupuesto en ese período que incluye alguna de esas categorías")


def create(db: Session, user_id: uuid.UUID, payload: BudgetCreate) -> BudgetResponse:
    category_id = _resolve_target(db, user_id, payload.category_id, payload.concept_id)
    extras = _resolve_extras(db, user_id, [c for c in payload.extra_category_ids if c != category_id])

    # Check duplicate
    if payload.concept_id:
        if budget_crud.get_duplicate(db, user_id, category_id, payload.month, payload.year,
                                     payload.currency, payload.concept_id):
            raise BudgetAlreadyExists("Ya existe un presupuesto para este concepto en este período")
    else:
        all_cats = {category_id} | set(extras)
        _check_cat_budget_overlap(db, user_id, all_cats, payload.month, payload.year, payload.currency)

    budget = Budget(
        user_id=user_id,
        category_id=category_id,
        concept_id=payload.concept_id,
        name=payload.name if extras else None,
        extra_categories=[BudgetCategory(category_id=cid) for cid in extras],
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
            extras = _resolve_extras(db, user_id, [c for c in item.extra_category_ids if c != category_id])
            key = (category_id if item.concept_id is None else None, item.concept_id,
                   tuple(sorted(str(c) for c in extras)), item.currency)
            if key in seen:
                continue
            seen.add(key)
            existing = budget_crud.get_duplicate(db, user_id, category_id, payload.month, payload.year,
                                                 item.currency, item.concept_id)
            if existing:
                budget_crud.update(db, existing, item.max_amount)
                # Update extras
                existing.extra_categories = [BudgetCategory(category_id=cid) for cid in extras]
                existing.name = item.name if extras else None
                saved.append(existing)
            else:
                budget = Budget(
                    user_id=user_id,
                    category_id=category_id,
                    concept_id=item.concept_id,
                    name=item.name if extras else None,
                    extra_categories=[BudgetCategory(category_id=cid) for cid in extras],
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
