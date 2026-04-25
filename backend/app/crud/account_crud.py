import uuid
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy.orm import Session
from app.models.accounts_models import Account
from app.schemas.account_schema import AccountCreate, AccountUpdate


def get_by_id(db: Session, account_id: uuid.UUID) -> Account | None:
    return db.query(Account).filter(
        Account.id == account_id,
        Account.is_deleted == False,
    ).first()


def get_by_name_and_user(db: Session, name: str, user_id: uuid.UUID) -> Account | None:
    """Busca cuenta activa por nombre dentro del mismo usuario (multi-tenancy)."""
    return db.query(Account).filter(
        Account.name == name,
        Account.user_id == user_id,
        Account.is_deleted == False,
    ).first()


def get_all_by_user(db: Session, user_id: uuid.UUID) -> list[Account]:
    return db.query(Account).filter(
        Account.user_id == user_id,
        Account.is_deleted == False,
    ).all()


def create(db: Session, account_in: AccountCreate, user_id: uuid.UUID) -> Account:
    db_account = Account(
        user_id=user_id,
        name=account_in.name,
        type=account_in.type,
        currency=account_in.currency,
        balance=account_in.balance,
        credit_limit=account_in.credit_limit,
    )
    db.add(db_account)
    db.flush()
    return db_account


def update(db: Session, db_account: Account, update_data: AccountUpdate) -> Account:
    if update_data.name is not None:
        db_account.name = update_data.name
    if update_data.type is not None:
        db_account.type = update_data.type
    if update_data.currency is not None:
        db_account.currency = update_data.currency
    if update_data.credit_limit is not None:
        db_account.credit_limit = update_data.credit_limit
    if update_data.balance is not None:
        db_account.balance = update_data.balance
    db.flush()
    return db_account


def soft_delete(db: Session, db_account: Account) -> None:
    db_account.is_deleted = True
    db_account.deleted_at = datetime.now(timezone.utc)
    db.flush()
