from fastapi import APIRouter, Depends, status
from sqlalchemy.orm import Session

from app.api.dependeces import get_current_user
from app.core.database import get_db
from app.models.users_models import User
from app.schemas.external_account_schema import ExternalAccountCreate, ExternalAccountResponse
from app.services import external_account_service

router = APIRouter(prefix="/external-accounts", tags=["ExternalAccounts"])


@router.post("", response_model=ExternalAccountResponse, status_code=status.HTTP_201_CREATED)
def create_external_account(
    data: ExternalAccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return external_account_service.create(db, current_user, data)


@router.get("", response_model=list[ExternalAccountResponse])
def list_external_accounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return external_account_service.get_all(db, current_user)
