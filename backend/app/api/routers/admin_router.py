from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.dependeces import require_admin
from app.core.database import get_db
from app.services import admin_service

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/users")
def list_users(db: Session = Depends(get_db), _: None = Depends(require_admin)):
    return admin_service.list_users(db)


@router.get("/users/{user_id}")
def get_user_detail(
    user_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    return admin_service.get_user_detail(db, user_id)


@router.patch("/users/{user_id}/toggle-active")
def toggle_active(
    user_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    return admin_service.toggle_active(db, user_id)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    admin_service.delete_user(db, user_id)
