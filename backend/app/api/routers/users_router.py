from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.dependeces import get_current_user
from app.core.database import get_db
from app.models.users_models import User
from app.schemas.user_schema import UserCreate, UserUpdate, UserResponse, UserDeleteRequest
from app.services import user_service

router = APIRouter(prefix="/users", tags=["Users"])


@router.post("/register", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def register(user_in: UserCreate, db: Session = Depends(get_db)):
    return user_service.register(db, user_in)


@router.get("/me", response_model=UserResponse)
def get_me(current_user: User = Depends(get_current_user)):
    return user_service.get_me(current_user)


@router.patch("/me", response_model=UserResponse)
def update_me(
    user_update: UserUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return user_service.update_me(db, current_user, user_update)


@router.delete("/me", status_code=status.HTTP_204_NO_CONTENT)
def delete_me(
    req: UserDeleteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    user_service.delete_me(db, current_user, req)
