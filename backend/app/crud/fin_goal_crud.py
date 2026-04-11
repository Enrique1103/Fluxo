import uuid
from datetime import date as PyDate
from decimal import Decimal
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.fin_goals_models import FinGoal


def get_by_id(db: Session, goal_id: uuid.UUID) -> FinGoal | None:
    return db.query(FinGoal).filter(
        FinGoal.id == goal_id,
        FinGoal.is_deleted == False,
    ).first()


def get_all_by_user(db: Session, user_id: uuid.UUID) -> list[FinGoal]:
    return (
        db.query(FinGoal)
        .filter(FinGoal.user_id == user_id, FinGoal.is_deleted == False)
        .order_by(FinGoal.created_at.asc())
        .all()
    )


def get_active_allocation_sum(
    db: Session, user_id: uuid.UUID, exclude_goal_id: uuid.UUID | None = None
) -> Decimal:
    """Returns the sum of allocation_pct for all active (non-deleted, non-completed) goals."""
    query = db.query(func.coalesce(func.sum(FinGoal.allocation_pct), Decimal("0.00"))).filter(
        FinGoal.user_id == user_id,
        FinGoal.is_deleted == False,
        FinGoal.is_completed == False,
    )
    if exclude_goal_id is not None:
        query = query.filter(FinGoal.id != exclude_goal_id)
    result = query.scalar()
    return Decimal(str(result)) if result is not None else Decimal("0.00")


def create(
    db: Session,
    user_id: uuid.UUID,
    name: str,
    target_amount: Decimal,
    allocation_pct: Decimal,
    deadline: PyDate | None = None,
) -> FinGoal:
    db_goal = FinGoal(
        user_id=user_id,
        name=name,
        target_amount=target_amount,
        allocation_pct=allocation_pct,
        deadline=deadline,
    )
    db.add(db_goal)
    db.flush()
    return db_goal


def update(db: Session, db_goal: FinGoal, fields: dict) -> FinGoal:
    for field, value in fields.items():
        setattr(db_goal, field, value)
    db.flush()
    return db_goal


def soft_delete(db: Session, db_goal: FinGoal) -> None:
    db_goal.is_deleted = True
    db.flush()
