import uuid
from sqlalchemy.orm import Session

from app.core.utils import normalize_concept
from app.crud import concept_crud, transaction_crud
from app.exceptions.concept_exceptions import (
    ConceptNotFound,
    UnauthorizedConceptAccess,
    ConceptAlreadyExists,
    ConceptInUseByTransactions,
    SystemConceptCannotBeDeleted,
)
from app.models.concepts_models import Concept
from app.models.users_models import User
from app.schemas.concept_schema import ConceptCreate, ConceptUpdate


def _get_owned(db: Session, concept_id: uuid.UUID, user_id: uuid.UUID) -> Concept:
    concept = concept_crud.get_by_id(db, concept_id)
    if not concept:
        raise ConceptNotFound("Concepto no encontrado")
    if concept.user_id != user_id:
        raise UnauthorizedConceptAccess("No tienes acceso a este concepto")
    return concept


def create(db: Session, user: User, concept_in: ConceptCreate) -> Concept:
    name = normalize_concept(concept_in.name)

    if concept_crud.get_by_name_and_user(db, name, user.id):
        raise ConceptAlreadyExists("Ya existe un concepto con ese nombre")

    db_concept = concept_crud.create(db, user_id=user.id, name=name)
    db.commit()
    db.refresh(db_concept)
    return db_concept


def get_all(
    db: Session,
    user: User,
    category_id: uuid.UUID | None = None,
) -> list[Concept]:
    if category_id is not None:
        return concept_crud.get_by_category(db, user.id, category_id)
    return concept_crud.get_all_by_user(db, user.id)



def get_one(db: Session, user: User, concept_id: uuid.UUID) -> Concept:
    return _get_owned(db, concept_id, user.id)


def update(db: Session, user: User, concept_id: uuid.UUID, concept_update: ConceptUpdate) -> Concept:
    concept = _get_owned(db, concept_id, user.id)

    if concept.is_system:
        raise SystemConceptCannotBeDeleted("Los conceptos del sistema no pueden modificarse")

    fields: dict = {}

    if concept_update.name is not None:
        name = normalize_concept(concept_update.name)
        if name != concept.name:
            if concept_crud.get_by_name_and_user(db, name, user.id):
                raise ConceptAlreadyExists("Ya existe un concepto con ese nombre")
            fields["name"] = name

    if fields:
        concept_crud.update(db, concept, fields)
        db.commit()
        db.refresh(concept)

    return concept


def delete(db: Session, user: User, concept_id: uuid.UUID) -> None:
    concept = _get_owned(db, concept_id, user.id)

    if concept.is_system:
        raise SystemConceptCannotBeDeleted("Los conceptos del sistema no pueden eliminarse")

    if transaction_crud.has_active_for_concept(db, concept.id):
        raise ConceptInUseByTransactions("El concepto tiene transacciones activas y no puede eliminarse")

    concept_crud.delete(db, concept)
    db.commit()
