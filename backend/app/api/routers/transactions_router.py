import uuid
from datetime import date as PyDate
from fastapi import APIRouter, Depends, Query, status
from sqlalchemy.orm import Session

from app.api.dependeces import get_current_user
from app.core.database import get_db
from app.models.transactions_models import TransactionType, PaymentMethod
from app.models.users_models import User
from app.schemas.transaction_schema import TransactionCreate, TransactionUpdate, TransactionResponse
from app.services import transaction_service

router = APIRouter(prefix="/transactions", tags=["Transactions"])


@router.post("", response_model=TransactionResponse, status_code=status.HTTP_201_CREATED)
def create_transaction(
    tx_in: TransactionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return transaction_service.create(db, current_user, tx_in)


@router.get("", response_model=list[TransactionResponse])
def list_transactions(
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    account_id: uuid.UUID | None = Query(default=None),
    type: TransactionType | None = Query(default=None),
    category_id: uuid.UUID | None = Query(default=None),
    date_from: PyDate | None = Query(default=None),
    date_to: PyDate | None = Query(default=None),
    metodo_pago: PaymentMethod | None = Query(default=None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return transaction_service.get_all(
        db,
        current_user,
        limit=limit,
        offset=offset,
        account_id=account_id,
        transaction_type=type,
        category_id=category_id,
        date_from=date_from,
        date_to=date_to,
        metodo_pago=metodo_pago,
    )


@router.get("/{tx_id}", response_model=TransactionResponse)
def get_transaction(
    tx_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return transaction_service.get_one(db, current_user, tx_id)


@router.patch("/{tx_id}", response_model=TransactionResponse)
def update_transaction(
    tx_id: uuid.UUID,
    tx_update: TransactionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return transaction_service.update(db, current_user, tx_id, tx_update)


@router.delete("/{tx_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_transaction(
    tx_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    transaction_service.delete(db, current_user, tx_id)
