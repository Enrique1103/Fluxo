import uuid
from sqlalchemy import func
from sqlalchemy.orm import Session
from app.models.concepts_models import Concept
from app.models.categories_models import Category


def get_by_id(db: Session, concept_id: uuid.UUID) -> Concept | None:
    return db.query(Concept).filter(Concept.id == concept_id).first()


def get_by_name_and_user(
    db: Session, name: str, user_id: uuid.UUID
) -> Concept | None:
    # Sin distinguir mayúsculas: "FERIA" y "Feria" son el mismo concepto
    return db.query(Concept).filter(
        func.lower(Concept.name) == name.lower(),
        Concept.user_id == user_id,
    ).first()


def get_all_by_user(
    db: Session,
    user_id: uuid.UUID,
    category_id: uuid.UUID | None = None,
    kinds: tuple[str, ...] | None = None,
) -> list[Concept]:
    q = db.query(Concept).filter(Concept.user_id == user_id)
    if category_id is not None:
        q = q.filter(Concept.category_id == category_id)
    if kinds:
        # Los reintegros solo se ofrecen en ingresos, sea cual sea el tipo de su categoría
        from sqlalchemy import or_, and_
        q = q.join(Category, Category.id == Concept.category_id)
        # Una categoría puede servir para varios tipos ("expense,income"): se busca el tipo dentro
        kind_ok = or_(*[Category.kind == k if k == "any" else Category.kind.contains(k) for k in kinds])
        if "income" in kinds:
            q = q.filter(or_(Concept.is_refund == True, kind_ok))  # noqa: E712
        else:
            q = q.filter(Concept.is_refund == False, kind_ok)  # noqa: E712
    return q.order_by(Concept.frequency_score.desc(), Concept.name).all()


def create(
    db: Session,
    user_id: uuid.UUID,
    name: str,
    is_system: bool = False,
    category_id: uuid.UUID | None = None,
    is_refund: bool = False,
) -> Concept:
    if category_id is None:
        raise ValueError("Todo concepto debe pertenecer a una categoría")
    db_concept = Concept(
        user_id=user_id,
        name=name,
        frequency_score=0,
        is_system=is_system,
        category_id=category_id,
        is_refund=is_refund,
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
