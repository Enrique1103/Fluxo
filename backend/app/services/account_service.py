import uuid
from decimal import Decimal
from sqlalchemy.orm import Session

from app.crud import account_crud, transaction_crud
from app.exceptions.account_exceptions import (
    AccountNotFound,
    AccountAlreadyExists,
    UnauthorizedAccountAccess,
    AccountHasTransactions,
)
from app.models.accounts_models import Account, AccountType
from app.models.users_models import User
from app.schemas.account_schema import AccountCreate, AccountUpdate


def _get_owned(db: Session, account_id: uuid.UUID, user_id: uuid.UUID) -> Account:
    account = account_crud.get_by_id(db, account_id)
    if not account:
        raise AccountNotFound("Cuenta no encontrada")
    if account.user_id != user_id:
        raise UnauthorizedAccountAccess("No tienes acceso a esta cuenta")
    return account


def create(db: Session, user: User, account_in: AccountCreate) -> Account:
    if account_crud.get_by_name_and_user(db, account_in.name, user.id):
        raise AccountAlreadyExists("Ya existe una cuenta con ese nombre")

    db_account = account_crud.create(db, account_in, user.id)
    db.commit()
    db.refresh(db_account)
    return db_account


def get_all(db: Session, user: User) -> list[Account]:
    return account_crud.get_all_by_user(db, user.id)


def get_one(db: Session, user: User, account_id: uuid.UUID) -> Account:
    return _get_owned(db, account_id, user.id)


def update(db: Session, user: User, account_id: uuid.UUID, update_data: AccountUpdate) -> Account:
    account = _get_owned(db, account_id, user.id)

    if update_data.name is not None and update_data.name != account.name:
        if account_crud.get_by_name_and_user(db, update_data.name, user.id):
            raise AccountAlreadyExists("Ya existe una cuenta con ese nombre")

    account_crud.update(db, account, update_data)
    db.commit()
    db.refresh(account)
    return account


def delete(db: Session, user: User, account_id: uuid.UUID) -> None:
    account = _get_owned(db, account_id, user.id)

    if transaction_crud.has_active_for_account(db, account.id):
        raise AccountHasTransactions("No se puede eliminar una cuenta con transacciones activas")

    account_crud.soft_delete(db, account)
    db.commit()
