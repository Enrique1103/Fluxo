import uuid
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.crud import user_crud
from app.exceptions.user_exceptions import UserNotFound
from app.models.accounts_models import Account
from app.models.categories_models import Category
from app.models.users_models import User
from app.models.transactions_models import Transaction
from app.services.user_service import _hard_delete_user, ADMIN_EMAIL


def _to_uid(user_id: str) -> uuid.UUID:
    try:
        return uuid.UUID(user_id)
    except ValueError:
        raise UserNotFound("ID inválido")


def _get_user(db: Session, uid: uuid.UUID) -> User:
    db_user = user_crud.get_by_id(db, uid)
    if not db_user:
        raise UserNotFound("Usuario no encontrado")
    return db_user


def list_users(db: Session) -> list:
    rows = (
        db.query(User, func.count(Transaction.id).label("tx_count"))
        .outerjoin(Transaction, Transaction.user_id == User.id)
        .filter(User.email != ADMIN_EMAIL)
        .group_by(User.id)
        .order_by(User.created_at.desc())
        .all()
    )
    return [
        {
            "id": str(u.id),
            "name": u.name,
            "email": u.email,
            "created_at": u.created_at.isoformat(),
            "is_active": u.is_active,
            "tx_count": tx_count,
        }
        for u, tx_count in rows
    ]


def get_user_detail(db: Session, user_id: str) -> dict:
    uid = _to_uid(user_id)
    db_user = _get_user(db, uid)

    tx_count = db.query(func.count(Transaction.id)).filter(Transaction.user_id == uid).scalar() or 0
    account_count = db.query(func.count(Account.id)).filter(Account.user_id == uid, Account.is_deleted == False).scalar() or 0
    category_count = db.query(func.count(Category.id)).filter(Category.user_id == uid).scalar() or 0

    return {
        "id": str(db_user.id),
        "name": db_user.name,
        "email": db_user.email,
        "created_at": db_user.created_at.isoformat(),
        "is_active": db_user.is_active,
        "tx_count": tx_count,
        "account_count": account_count,
        "category_count": category_count,
    }


def toggle_active(db: Session, user_id: str) -> dict:
    uid = _to_uid(user_id)
    db_user = _get_user(db, uid)
    db_user.is_active = not db_user.is_active
    db.commit()
    return {"id": str(db_user.id), "is_active": db_user.is_active}


def delete_user(db: Session, user_id: str) -> None:
    uid = _to_uid(user_id)
    db_user = _get_user(db, uid)
    _hard_delete_user(db, db_user)
