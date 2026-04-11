from sqlalchemy.orm import Session
from app.models.revoked_tokens_models import RevokedToken


def add(db: Session, token: str) -> None:
    db.add(RevokedToken(token=token))
    db.flush()


def is_revoked(db: Session, token: str) -> bool:
    return db.query(RevokedToken).filter(RevokedToken.token == token).first() is not None
