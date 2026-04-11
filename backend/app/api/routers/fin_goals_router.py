import uuid
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from app.api.dependeces import get_current_user
from app.core.database import get_db
from app.exceptions.fin_goal_exceptions import (
    FinGoalNotFound, UnauthorizedFinGoalAccess, AllocationExceedsLimit, FinGoalLimitExceeded,
)
from app.models.users_models import User
from app.schemas.fin_goal_schema import FinGoalCreate, FinGoalUpdate, FinGoalResponse
from app.services import fin_goal_service

router = APIRouter(prefix="/fin-goals", tags=["FinGoals"])


@router.post("", response_model=FinGoalResponse, status_code=status.HTTP_201_CREATED)
def create_goal(
    goal_in: FinGoalCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return fin_goal_service.create(db, current_user, goal_in)
    except FinGoalLimitExceeded as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))
    except AllocationExceedsLimit as e:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=str(e))


@router.get("", response_model=list[FinGoalResponse])
def list_goals(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return fin_goal_service.get_all(db, current_user)


@router.get("/{goal_id}", response_model=FinGoalResponse)
def get_goal(
    goal_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return fin_goal_service.get_one(db, current_user, goal_id)


@router.patch("/{goal_id}", response_model=FinGoalResponse)
def update_goal(
    goal_id: uuid.UUID,
    goal_update: FinGoalUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return fin_goal_service.update(db, current_user, goal_id, goal_update)


@router.delete("/{goal_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_goal(
    goal_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fin_goal_service.delete(db, current_user, goal_id)
