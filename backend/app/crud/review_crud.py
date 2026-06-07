import uuid
from sqlalchemy.orm import Session
from app.models.review_models import TransactionReview, ReviewType, ReviewStatus


def create(
    db: Session,
    transaction_id: uuid.UUID,
    household_id: uuid.UUID,
    flagged_by_user_id: uuid.UUID,
    flag_type: ReviewType,
    comment: str | None,
) -> TransactionReview:
    r = TransactionReview(
        transaction_id=transaction_id,
        household_id=household_id,
        flagged_by_user_id=flagged_by_user_id,
        flag_type=flag_type,
        comment=comment,
        status=ReviewStatus.PENDING,
    )
    db.add(r)
    db.flush()
    return r


def get_by_id(db: Session, review_id: uuid.UUID) -> TransactionReview | None:
    return db.query(TransactionReview).filter(TransactionReview.id == review_id).first()


def get_by_household(
    db: Session,
    household_id: uuid.UUID,
    status: ReviewStatus | None = None,
) -> list[TransactionReview]:
    q = db.query(TransactionReview).filter(TransactionReview.household_id == household_id)
    if status:
        q = q.filter(TransactionReview.status == status)
    return q.order_by(TransactionReview.created_at.desc()).all()


def get_by_transaction(db: Session, transaction_id: uuid.UUID) -> list[TransactionReview]:
    return (
        db.query(TransactionReview)
        .filter(TransactionReview.transaction_id == transaction_id)
        .order_by(TransactionReview.created_at.desc())
        .all()
    )


def update_status(
    db: Session,
    review: TransactionReview,
    status: ReviewStatus,
    response_comment: str | None,
) -> TransactionReview:
    from datetime import datetime, timezone
    review.status = status
    review.response_comment = response_comment
    review.response_at = datetime.now(timezone.utc)
    db.flush()
    return review


def delete(db: Session, review: TransactionReview) -> None:
    db.delete(review)
    db.flush()
