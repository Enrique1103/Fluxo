import uuid
from sqlalchemy.orm import Session
from sqlalchemy import func

from app.crud import user_crud
from app.exceptions.user_exceptions import UserNotFound
from app.models.users_models import User
from app.models.transactions_models import Transaction
from app.services.user_service import _hard_delete_user, ADMIN_EMAIL


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


def delete_user(db: Session, user_id: str) -> None:
    try:
        uid = uuid.UUID(user_id)
    except ValueError:
        raise UserNotFound("ID inválido")

    db_user = user_crud.get_by_id(db, uid)
    if not db_user:
        raise UserNotFound("Usuario no encontrado")

    _hard_delete_user(db, db_user)
