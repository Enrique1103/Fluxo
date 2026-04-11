import uuid
from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.dependeces import get_current_user
from app.core.database import get_db
from app.models.users_models import User
from app.schemas.category_schema import CategoryCreate, CategoryUpdate, CategoryResponse
from app.services import category_service

router = APIRouter(prefix="/categories", tags=["Categories"])


@router.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(
    category_in: CategoryCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return category_service.create(db, current_user, category_in)


@router.get("", response_model=list[CategoryResponse])
def list_categories(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return category_service.get_all(db, current_user)


@router.get("/{category_id}", response_model=CategoryResponse)
def get_category(
    category_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return category_service.get_one(db, current_user, category_id)


@router.patch("/{category_id}", response_model=CategoryResponse)
def update_category(
    category_id: uuid.UUID,
    category_update: CategoryUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return category_service.update(db, current_user, category_id, category_update)


@router.delete("/{category_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(
    category_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    category_service.delete(db, current_user, category_id)
