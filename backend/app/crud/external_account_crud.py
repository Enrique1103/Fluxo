import uuid
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.models.external_account_models import ExternalAccount
from app.schemas.external_account_schema import ExternalAccountCreate


def create(db: Session, user_id: uuid.UUID, data: ExternalAccountCreate) -> ExternalAccount:
    acct = ExternalAccount(
        user_id=user_id,
        name=data.name,
        account_number=data.account_number,
        owner_name=data.owner_name,
        created_at=datetime.now(timezone.utc),
    )
    db.add(acct)
    db.flush()
    return acct


def get_all_by_user(db: Session, user_id: uuid.UUID) -> list[ExternalAccount]:
    return (
        db.query(ExternalAccount)
        .filter(ExternalAccount.user_id == user_id)
        .order_by(ExternalAccount.created_at.asc())
        .all()
    )


def get_by_id(db: Session, external_account_id: uuid.UUID) -> ExternalAccount | None:
    return db.query(ExternalAccount).filter(ExternalAccount.id == external_account_id).first()
