import uuid
from decimal import Decimal
from sqlalchemy.orm import Session

from app.crud import fin_goal_crud, account_crud
from app.exceptions.fin_goal_exceptions import (
    FinGoalNotFound,
    UnauthorizedFinGoalAccess,
    AllocationExceedsLimit,
    FinGoalLimitExceeded,
)

MAX_GOALS = 3
from app.models.fin_goals_models import FinGoal
from app.models.users_models import User
from app.schemas.fin_goal_schema import FinGoalCreate, FinGoalUpdate, FinGoalResponse


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_owned(db: Session, goal_id: uuid.UUID, user_id: uuid.UUID) -> FinGoal:
    goal = fin_goal_crud.get_by_id(db, goal_id)
    if not goal:
        raise FinGoalNotFound("Meta financiera no encontrada")
    if goal.user_id != user_id:
        raise UnauthorizedFinGoalAccess("No tienes acceso a esta meta")
    return goal


def _calculate_current_amount(db: Session, goal: FinGoal) -> Decimal:
    """Patrimonio neto × allocation_pct / 100."""
    accounts = account_crud.get_all_by_user(db, goal.user_id)
    total_balance = sum((a.balance for a in accounts), Decimal("0.00"))
    return (total_balance * goal.allocation_pct / Decimal("100")).quantize(Decimal("0.01"))


def _to_response(db: Session, goal: FinGoal) -> FinGoalResponse:
    current_amount = _calculate_current_amount(db, goal)

    if not goal.is_completed and current_amount >= goal.target_amount:
        goal.is_completed = True
        db.flush()

    response = FinGoalResponse.model_validate(goal)
    response.current_amount = current_amount
    return response


def _validate_allocation(
    db: Session,
    user_id: uuid.UUID,
    new_pct: Decimal,
    exclude_goal_id: uuid.UUID | None = None,
) -> None:
    current_sum = fin_goal_crud.get_active_allocation_sum(db, user_id, exclude_goal_id)
    if current_sum + new_pct > Decimal("100.00"):
        available = Decimal("100.00") - current_sum
        raise AllocationExceedsLimit(
            f"La suma de asignaciones superaría 100%. Disponible: {available}%"
        )


# ---------------------------------------------------------------------------
# Service functions
# ---------------------------------------------------------------------------

def create(db: Session, user: User, goal_in: FinGoalCreate) -> FinGoalResponse:
    existing = fin_goal_crud.get_all_by_user(db, user.id)
    if len(existing) >= MAX_GOALS:
        raise FinGoalLimitExceeded(f"Solo podés tener {MAX_GOALS} metas financieras activas")

    _validate_allocation(db, user.id, goal_in.allocation_pct)

    db_goal = fin_goal_crud.create(
        db,
        user_id=user.id,
        name=goal_in.name,
        target_amount=goal_in.target_amount,
        allocation_pct=goal_in.allocation_pct,
        deadline=goal_in.deadline,
    )
    response = _to_response(db, db_goal)
    db.commit()
    return response


def get_all(db: Session, user: User) -> list[FinGoalResponse]:
    goals = fin_goal_crud.get_all_by_user(db, user.id)
    responses = [_to_response(db, g) for g in goals]
    db.commit()
    return responses


def get_one(db: Session, user: User, goal_id: uuid.UUID) -> FinGoalResponse:
    goal = _get_owned(db, goal_id, user.id)
    response = _to_response(db, goal)
    db.commit()
    return response


def update(db: Session, user: User, goal_id: uuid.UUID, goal_update: FinGoalUpdate) -> FinGoalResponse:
    goal = _get_owned(db, goal_id, user.id)
    fields: dict = {}

    if goal_update.allocation_pct is not None and goal_update.allocation_pct != goal.allocation_pct:
        _validate_allocation(db, user.id, goal_update.allocation_pct, exclude_goal_id=goal.id)
        fields["allocation_pct"] = goal_update.allocation_pct

    if goal_update.name is not None:
        fields["name"] = goal_update.name

    if goal_update.target_amount is not None:
        fields["target_amount"] = goal_update.target_amount

    if "deadline" in goal_update.model_fields_set:
        fields["deadline"] = goal_update.deadline

    if fields:
        fin_goal_crud.update(db, goal, fields)

    response = _to_response(db, goal)
    db.commit()
    return response


def delete(db: Session, user: User, goal_id: uuid.UUID) -> None:
    goal = _get_owned(db, goal_id, user.id)
    fin_goal_crud.soft_delete(db, goal)
    db.commit()
