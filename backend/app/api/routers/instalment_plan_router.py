import uuid
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.dependeces import get_current_user
from app.core.database import get_db
from app.models.users_models import User
from app.schemas.instalment_plan_schema import (
    InstalmentPlanCreate,
    InstalmentPlanUpdate,
    InstalmentPlanResponse,
)
from app.services import instalment_plan_service

router = APIRouter(prefix="/instalment-plans", tags=["Instalment Plans"])


@router.post("", response_model=InstalmentPlanResponse, status_code=status.HTTP_201_CREATED)
def create_plan(
    data: InstalmentPlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return instalment_plan_service.create(db, current_user, data)


@router.get("", response_model=list[InstalmentPlanResponse])
def list_plans(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return instalment_plan_service.get_all(db, current_user)


@router.get("/{plan_id}", response_model=InstalmentPlanResponse)
def get_plan(
    plan_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return instalment_plan_service.get_one(db, current_user, plan_id)


@router.patch("/{plan_id}", response_model=InstalmentPlanResponse)
def update_plan(
    plan_id: uuid.UUID,
    data: InstalmentPlanUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return instalment_plan_service.update(db, current_user, plan_id, data)


@router.delete("/{plan_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_plan(
    plan_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    instalment_plan_service.cancel(db, current_user, plan_id)
