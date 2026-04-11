import uuid
from sqlalchemy.orm import Session
from app.models.categories_models import Category


def get_by_id(db: Session, category_id: uuid.UUID) -> Category | None:
    return db.query(Category).filter(Category.id == category_id).first()


def get_by_name_and_user(db: Session, name: str, user_id: uuid.UUID) -> Category | None:
    return db.query(Category).filter(
        Category.name == name,
        Category.user_id == user_id,
    ).first()


def get_all_by_user(db: Session, user_id: uuid.UUID) -> list[Category]:
    return db.query(Category).filter(Category.user_id == user_id).all()


def create(
    db: Session,
    user_id: uuid.UUID,
    name: str,
    slug: str,
    icon: str | None = None,
    color: str | None = None,
    is_system: bool = False,
) -> Category:
    db_cat = Category(
        user_id=user_id,
        name=name,
        slug=slug,
        icon=icon,
        color=color,
        is_system=is_system,
    )
    db.add(db_cat)
    db.flush()
    return db_cat


def update(db: Session, db_cat: Category, fields: dict) -> Category:
    for field, value in fields.items():
        setattr(db_cat, field, value)
    db.flush()
    return db_cat


def delete(db: Session, db_cat: Category) -> None:
    db.delete(db_cat)
    db.flush()
