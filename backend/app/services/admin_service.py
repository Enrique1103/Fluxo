import uuid
from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func, extract

from app.crud import user_crud
from app.exceptions.user_exceptions import UserNotFound
from app.models.accounts_models import Account
from app.models.categories_models import Category
from app.models.users_models import User
from app.models.transactions_models import Transaction
from app.services.user_service import _hard_delete_user, ADMIN_EMAIL

_MONTHS_ES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"]


def _last_6_months() -> list[tuple[int, int]]:
    now = datetime.now(timezone.utc)
    y, m = now.year, now.month
    result = []
    for _ in range(6):
        result.append((y, m))
        m -= 1
        if m == 0:
            m, y = 12, y - 1
    result.reverse()
    return result


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
        db.query(
            User,
            func.count(Transaction.id).label("tx_count"),
            func.max(Transaction.date).label("last_activity"),
        )
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
            "last_activity": last_activity.isoformat() if last_activity else None,
        }
        for u, tx_count, last_activity in rows
    ]


def get_stats(db: Session) -> dict:
    now = datetime.now(timezone.utc)
    thirty_days_ago = now - timedelta(days=30)
    months = _last_6_months()
    six_months_ago = datetime(months[0][0], months[0][1], 1, tzinfo=timezone.utc)

    total_users  = db.query(func.count(User.id)).filter(User.email != ADMIN_EMAIL).scalar() or 0
    active_users = db.query(func.count(User.id)).filter(User.email != ADMIN_EMAIL, User.is_active == True).scalar() or 0
    new_users_30d = db.query(func.count(User.id)).filter(
        User.email != ADMIN_EMAIL, User.created_at >= thirty_days_ago
    ).scalar() or 0

    total_txs = db.query(func.count(Transaction.id)).scalar() or 0
    txs_30d   = db.query(func.count(Transaction.id)).filter(Transaction.created_at >= thirty_days_ago).scalar() or 0

    user_rows = (
        db.query(
            extract("year",  User.created_at).label("yr"),
            extract("month", User.created_at).label("mo"),
            func.count(User.id).label("cnt"),
        )
        .filter(User.email != ADMIN_EMAIL, User.created_at >= six_months_ago)
        .group_by("yr", "mo")
        .all()
    )
    user_map = {(int(r.yr), int(r.mo)): r.cnt for r in user_rows}

    tx_rows = (
        db.query(
            extract("year",  Transaction.created_at).label("yr"),
            extract("month", Transaction.created_at).label("mo"),
            func.count(Transaction.id).label("cnt"),
        )
        .filter(Transaction.created_at >= six_months_ago)
        .group_by("yr", "mo")
        .all()
    )
    tx_map = {(int(r.yr), int(r.mo)): r.cnt for r in tx_rows}

    return {
        "total_users":          total_users,
        "active_users":         active_users,
        "inactive_users":       total_users - active_users,
        "new_users_30d":        new_users_30d,
        "total_transactions":   total_txs,
        "transactions_30d":     txs_30d,
        "users_by_month":       [{"month": _MONTHS_ES[m - 1], "count": user_map.get((y, m), 0)} for y, m in months],
        "transactions_by_month":[{"month": _MONTHS_ES[m - 1], "count": tx_map.get((y, m), 0)}  for y, m in months],
    }


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
