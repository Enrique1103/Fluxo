
import uuid
from sqlalchemy.orm import Session

from app.core.utils import slugify, normalize_category
from app.crud import category_crud, transaction_crud
from app.exceptions.category_exceptions import (
    CategoryNotFound,
    CategoryAlreadyExists,
    CategoryHasActiveTransactions,
    SystemCategoryCannotBeModified,
)
from app.models.categories_models import Category
from app.models.users_models import User
from app.schemas.category_schema import CategoryCreate, CategoryUpdate


def _get_owned(db: Session, category_id: uuid.UUID, user_id: uuid.UUID) -> Category:
    cat = category_crud.get_by_id(db, category_id)
    if not cat:
        raise CategoryNotFound("Categoría no encontrada")
    if cat.user_id != user_id:
        raise CategoryNotFound("Categoría no encontrada")
    return cat


def create(db: Session, user: User, category_in: CategoryCreate) -> Category:
    name = normalize_category(category_in.name)

    if category_crud.get_by_name_and_user(db, name, user.id):
        raise CategoryAlreadyExists("Ya existe una categoría con ese nombre")

    slug = slugify(name)
    db_cat = category_crud.create(
        db,
        user_id=user.id,
        name=name,
        slug=slug,
        icon=category_in.icon,
        color=category_in.color,
        is_system=False,
    )
    db.commit()
    db.refresh(db_cat)
    return db_cat


def get_all(db: Session, user: User) -> list[Category]:
    return category_crud.get_all_by_user(db, user.id)


def get_one(db: Session, user: User, category_id: uuid.UUID) -> Category:
    return _get_owned(db, category_id, user.id)


def update(db: Session, user: User, category_id: uuid.UUID, category_update: CategoryUpdate) -> Category:
    cat = _get_owned(db, category_id, user.id)

    if cat.is_system:
        raise SystemCategoryCannotBeModified("Las categorías del sistema no se pueden modificar")

    fields: dict = {}

    if category_update.name is not None:
        name = normalize_category(category_update.name)
        if name != cat.name:
            if category_crud.get_by_name_and_user(db, name, user.id):
                raise CategoryAlreadyExists("Ya existe una categoría con ese nombre")
            fields["name"] = name
            fields["slug"] = slugify(name)

    if category_update.icon is not None:
        fields["icon"] = category_update.icon

    if category_update.color is not None:
        fields["color"] = category_update.color

    if fields:
        category_crud.update(db, cat, fields)
        db.commit()
        db.refresh(cat)

    return cat


def delete(db: Session, user: User, category_id: uuid.UUID) -> None:
    cat = _get_owned(db, category_id, user.id)

    if cat.is_system:
        raise SystemCategoryCannotBeModified("Las categorías del sistema no se pueden eliminar")

    if transaction_crud.has_active_for_category(db, cat.id):
        raise CategoryHasActiveTransactions(
            "La categoría tiene transacciones activas y no puede eliminarse"
        )

    category_crud.delete(db, cat)
    db.commit()
