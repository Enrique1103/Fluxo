import uuid
from sqlalchemy.orm import Session
from app.models.users_models import User
from app.schemas.user_schema import UserCreate


def get_by_email(db: Session, email: str) -> User | None:
    return db.query(User).filter(User.email == email).first()


def get_by_id(db: Session, user_id: uuid.UUID) -> User | None:
    return db.query(User).filter(User.id == user_id).first()


def create(db: Session, user_in: UserCreate, hashed_password: str) -> User:
    db_user = User(
        name=user_in.name,
        email=user_in.email,
        password_hash=hashed_password,
        currency_default=user_in.currency_default,
    )
    db.add(db_user)
    db.flush()
    return db_user


def update(db: Session, db_user: User, fields: dict) -> User:
    for field, value in fields.items():
        setattr(db_user, field, value)
    db.flush()
    return db_user


def delete(db: Session, db_user: User) -> None:
    db.delete(db_user)
    db.flush()
