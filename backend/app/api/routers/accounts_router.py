import uuid
from datetime import date as PyDate
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.dependeces import get_current_user
from app.core.database import get_db
from app.models.transactions_models import TransactionType
from app.models.users_models import User
from app.schemas.account_schema import AccountCreate, AccountUpdate, AccountResponse
from app.schemas.transaction_schema import TransactionResponse
from app.services import account_service, transaction_service

router = APIRouter(prefix="/accounts", tags=["Accounts"])


@router.post("", response_model=AccountResponse, status_code=status.HTTP_201_CREATED)
def create_account(
    account_in: AccountCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return account_service.create(db, current_user, account_in)


@router.get("", response_model=list[AccountResponse])
def list_accounts(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return account_service.get_all(db, current_user)


@router.get("/{account_id}", response_model=AccountResponse)
def get_account(
    account_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return account_service.get_one(db, current_user, account_id)


@router.patch("/{account_id}", response_model=AccountResponse)
def update_account(
    account_id: uuid.UUID,
    update_data: AccountUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return account_service.update(db, current_user, account_id, update_data)


@router.delete("/{account_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_account(
    account_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    account_service.delete(db, current_user, account_id)


@router.get("/{account_id}/transactions", response_model=list[TransactionResponse])
def list_account_transactions(
    account_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    type: TransactionType | None = Query(default=None),
    category_id: uuid.UUID | None = Query(default=None),
    date_from: PyDate | None = Query(default=None),
    date_to: PyDate | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return transaction_service.get_all_by_account(
        db,
        current_user,
        account_id=account_id,
        limit=limit,
        offset=offset,
        transaction_type=type,
        category_id=category_id,
        date_from=date_from,
        date_to=date_to,
    )
