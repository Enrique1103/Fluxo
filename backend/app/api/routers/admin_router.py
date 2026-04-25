from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session

from app.api.dependeces import require_admin
from app.core.database import get_db
from app.services import admin_service


class ResetPasswordRequest(BaseModel):
    new_password: str = Field(..., min_length=6)

router = APIRouter(prefix="/admin", tags=["Admin"])


@router.get("/stats")
def get_stats(db: Session = Depends(get_db), _: None = Depends(require_admin)):
    return admin_service.get_stats(db)


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


@router.post("/users/{user_id}/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(
    user_id: str,
    body: ResetPasswordRequest,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    admin_service.reset_password(db, user_id, body.new_password)


@router.delete("/users/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_user(
    user_id: str,
    db: Session = Depends(get_db),
    _: None = Depends(require_admin),
):
    admin_service.delete_user(db, user_id)
