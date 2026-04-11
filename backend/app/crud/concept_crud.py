import uuid
from sqlalchemy.orm import Session
from app.models.concepts_models import Concept
from app.models.transactions_models import Transaction


def get_by_id(db: Session, concept_id: uuid.UUID) -> Concept | None:
    return db.query(Concept).filter(Concept.id == concept_id).first()


def get_by_name_and_user(
    db: Session, name: str, user_id: uuid.UUID
) -> Concept | None:
    return db.query(Concept).filter(
        Concept.name == name,
        Concept.user_id == user_id,
    ).first()


def get_all_by_user(db: Session, user_id: uuid.UUID) -> list[Concept]:
    return (
        db.query(Concept)
        .filter(Concept.user_id == user_id)
        .order_by(Concept.frequency_score.desc(), Concept.name)
        .all()
    )


def get_by_category(
    db: Session, user_id: uuid.UUID, category_id: uuid.UUID
) -> list[Concept]:
    """
    Devuelve los conceptos que el usuario ha usado en transacciones de esta categoría,
    ordenados por frecuencia de uso con esa categoría.
    Si no hay historial, devuelve todos los conceptos del usuario.
    """
    used = (
        db.query(Concept)
        .join(Transaction, Transaction.concept_id == Concept.id)
        .filter(
            Concept.user_id == user_id,
            Transaction.user_id == user_id,
            Transaction.category_id == category_id,
            Transaction.is_deleted == False,
        )
        .order_by(Concept.frequency_score.desc(), Concept.name)
        .distinct()
        .all()
    )
    if used:
        return used
    # Sin historial → fallback a todos los conceptos
    return get_all_by_user(db, user_id)


def create(
    db: Session,
    user_id: uuid.UUID,
    name: str,
    is_system: bool = False,
) -> Concept:
    db_concept = Concept(
        user_id=user_id,
        name=name,
        frequency_score=0,
        is_system=is_system,
    )
    db.add(db_concept)
    db.flush()
    return db_concept


def update(db: Session, db_concept: Concept, fields: dict) -> Concept:
    for field, value in fields.items():
        setattr(db_concept, field, value)
    db.flush()
    return db_concept


def increment_frequency(db: Session, db_concept: Concept) -> None:
    db_concept.frequency_score += 1
    db.flush()


def decrement_frequency(db: Session, db_concept: Concept) -> None:
    if db_concept.frequency_score > 0:
        db_concept.frequency_score -= 1
        db.flush()


def delete(db: Session, db_concept: Concept) -> None:
    db.delete(db_concept)
    db.flush()
