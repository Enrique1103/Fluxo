import uuid
from datetime import date as PyDate, datetime, timezone
from sqlalchemy.orm import Session
from app.models.instalment_plan_models import InstalmentPlan
from app.models.transactions_models import Transaction


def get_by_id(db: Session, plan_id: uuid.UUID) -> InstalmentPlan | None:
    return db.query(InstalmentPlan).filter(
        InstalmentPlan.id == plan_id,
        InstalmentPlan.is_deleted == False,
    ).first()


def get_all_by_user(db: Session, user_id: uuid.UUID) -> list[InstalmentPlan]:
    return db.query(InstalmentPlan).filter(
        InstalmentPlan.user_id == user_id,
        InstalmentPlan.is_deleted == False,
    ).order_by(InstalmentPlan.created_at.desc()).all()


def create(
    db: Session,
    user_id: uuid.UUID,
    account_id: uuid.UUID,
    category_id: uuid.UUID,
    concept_id: uuid.UUID,
    description: str | None,
    total_amount,
    n_cuotas: int,
    fecha_inicio: PyDate,
    metodo_pago,
) -> InstalmentPlan:
    plan = InstalmentPlan(
        user_id=user_id,
        account_id=account_id,
        category_id=category_id,
        concept_id=concept_id,
        description=description,
        total_amount=total_amount,
        n_cuotas=n_cuotas,
        fecha_inicio=fecha_inicio,
        metodo_pago=metodo_pago,
    )
    db.add(plan)
    db.flush()
    return plan


def update(db: Session, plan: InstalmentPlan, fields: dict) -> InstalmentPlan:
    for field, value in fields.items():
        setattr(plan, field, value)
    db.flush()
    return plan


def soft_delete(db: Session, plan: InstalmentPlan) -> None:
    plan.is_deleted = True
    plan.deleted_at = datetime.now(timezone.utc)
    db.flush()


def get_future_cuotas(db: Session, plan_id: uuid.UUID, from_date: PyDate) -> list[Transaction]:
    """Devuelve las cuotas con fecha > from_date que aún no fueron soft-deleted."""
    return db.query(Transaction).filter(
        Transaction.instalment_plan_id == plan_id,
        Transaction.is_deleted == False,
        Transaction.date > from_date,
    ).all()


def count_cuotas_pagadas(db: Session, plan_id: uuid.UUID, today: PyDate) -> int:
    return db.query(Transaction).filter(
        Transaction.instalment_plan_id == plan_id,
        Transaction.is_deleted == False,
        Transaction.date <= today,
    ).count()


def count_cuotas_restantes(db: Session, plan_id: uuid.UUID, today: PyDate) -> int:
    return db.query(Transaction).filter(
        Transaction.instalment_plan_id == plan_id,
        Transaction.is_deleted == False,
        Transaction.date > today,
    ).count()
