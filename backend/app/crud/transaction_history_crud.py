import uuid
from sqlalchemy.orm import Session
from app.models.transaction_history_models import TransactionHistory


def create(
    db: Session,
    transaction_id: uuid.UUID,
    user_id: uuid.UUID,
    action: str,
    snapshot: dict,
    changes: dict | None = None,
) -> TransactionHistory:
    entry = TransactionHistory(
        transaction_id=transaction_id,
        user_id=user_id,
        action=action,
        snapshot=snapshot,
        changes=changes,
    )
    db.add(entry)
    db.flush()
    return entry


def get_by_transaction(db: Session, transaction_id: uuid.UUID) -> list[TransactionHistory]:
    return (
        db.query(TransactionHistory)
        .filter(TransactionHistory.transaction_id == transaction_id)
        .order_by(TransactionHistory.created_at.asc())
        .all()
    )


def get_recent_by_user(db: Session, user_id: uuid.UUID, limit: int = 50, offset: int = 0) -> list[TransactionHistory]:
    return (
        db.query(TransactionHistory)
        .filter(TransactionHistory.user_id == user_id)
        .order_by(TransactionHistory.created_at.desc())
        .offset(offset)
        .limit(limit)
        .all()
    )
