import uuid
from sqlalchemy.orm import Session

from app.core.utils import normalize_concept
from app.crud import concept_crud, transaction_crud, category_crud
from app.exceptions.concept_exceptions import (
    ConceptNotFound,
    UnauthorizedConceptAccess,
    ConceptAlreadyExists,
    ConceptInUseByTransactions,
    SystemConceptCannotBeDeleted,
    ConceptRequired,
    ConceptTypeMismatch,
)
from app.exceptions.category_exceptions import CategoryNotFound
from app.models.categories_models import Category, TX_TYPE_TO_KINDS
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


def _get_owned_category(db: Session, category_id: uuid.UUID, user_id: uuid.UUID) -> Category:
    cat = category_crud.get_by_id(db, category_id)
    if not cat or cat.user_id != user_id:
        raise CategoryNotFound("La categoría no existe o no pertenece al usuario")
    return cat


def create(db: Session, user: User, concept_in: ConceptCreate) -> Concept:
    name = normalize_concept(concept_in.name)

    if concept_crud.get_by_name_and_user(db, name, user.id):
        raise ConceptAlreadyExists("Ya existe un concepto con ese nombre")

    category = _get_owned_category(db, concept_in.category_id, user.id)
    db_concept = concept_crud.create(
        db, user_id=user.id, name=name, category_id=category.id, is_refund=concept_in.is_refund,
    )
    db.commit()
    db.refresh(db_concept)
    return db_concept


def get_all(
    db: Session,
    user: User,
    category_id: uuid.UUID | None = None,
    tx_type: str | None = None,
) -> list[Concept]:
    """
    Conceptos del usuario. Con category_id: solo los de esa categoría.
    Con tx_type (expense/income/transfer): solo los que sirven para ese tipo de
    movimiento, según el "kind" de su categoría (así no aparece "Supermercado"
    al cargar un ingreso).
    """
    kinds = TX_TYPE_TO_KINDS.get(tx_type) if tx_type else None
    return concept_crud.get_all_by_user(db, user.id, category_id=category_id, kinds=kinds)



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

    move_to: uuid.UUID | None = None
    if concept_update.category_id is not None and concept_update.category_id != concept.category_id:
        move_to = _get_owned_category(db, concept_update.category_id, user.id).id
        fields["category_id"] = move_to

    if concept_update.is_refund is not None and concept_update.is_refund != concept.is_refund:
        fields["is_refund"] = concept_update.is_refund

    if fields:
        concept_crud.update(db, concept, fields)
        if "is_refund" in fields:
            # Los ingresos ya cargados con este concepto pasan a contar (o dejan de contar) como reintegro
            from app.models.transactions_models import Transaction, TransactionType
            db.query(Transaction).filter(
                Transaction.concept_id == concept.id, Transaction.type == TransactionType.INCOME,
            ).update({"is_refund": fields["is_refund"]}, synchronize_session=False)
        if move_to is not None:
            # La categoría de un movimiento sale de su concepto: si el concepto
            # cambia de categoría, sus movimientos (y planes de cuotas) también.
            from app.models.transactions_models import Transaction
            from app.models.instalment_plan_models import InstalmentPlan
            db.query(Transaction).filter(Transaction.concept_id == concept.id).update(
                {"category_id": move_to}, synchronize_session=False
            )
            db.query(InstalmentPlan).filter(InstalmentPlan.concept_id == concept.id).update(
                {"category_id": move_to}, synchronize_session=False
            )
        db.commit()
        db.refresh(concept)

    return concept


def delete(db: Session, user: User, concept_id: uuid.UUID) -> None:
    concept = _get_owned(db, concept_id, user.id)

    if concept.is_system:
        raise SystemConceptCannotBeDeleted("Los conceptos del sistema no pueden eliminarse")

    if transaction_crud.has_active_for_concept(db, concept.id):
        raise ConceptInUseByTransactions("El concepto tiene transacciones activas y no puede eliminarse")

    # Los movimientos ya borrados que apuntaban al concepto (concept_id es obligatorio)
    # pasan al concepto genérico de su categoría, para poder borrarlo sin romper la base.
    from app.models.transactions_models import Transaction
    if db.query(Transaction.id).filter(Transaction.concept_id == concept.id).first():
        replacement = get_or_create_default(db, user.id, concept.category)
        if replacement.id == concept.id:
            from app.services import category_service
            replacement = get_or_create_default(db, user.id, category_service.get_or_create_fallback(db, user.id))
        db.query(Transaction).filter(Transaction.concept_id == concept.id).update(
            {"concept_id": replacement.id}, synchronize_session=False
        )
        db.expire(concept, ["transactions"])

    concept_crud.delete(db, concept)
    db.commit()


# ---------------------------------------------------------------------------
# Helpers usados al registrar movimientos
# ---------------------------------------------------------------------------

_TYPE_LABELS = {"expense": "gastos", "income": "ingresos", "transfer": "transferencias"}


def resolve_for_transaction(
    db: Session,
    user: User,
    concept_id: uuid.UUID | None,
    tx_type: str,
) -> Concept:
    """
    Concepto de un movimiento nuevo (o editado): obligatorio, del usuario y
    compatible con el tipo de movimiento. Para transferencias sin concepto se
    usa "Transferencia". La categoría del movimiento es concept.category_id.
    """
    tx_type = getattr(tx_type, "value", tx_type)
    if concept_id is None:
        if tx_type == "transfer":
            return get_transfer_default(db, user.id)
        raise ConceptRequired("Elegí un concepto para el movimiento")

    concept = concept_crud.get_by_id(db, concept_id)
    if not concept or concept.user_id != user.id:
        from app.exceptions.transaction_exceptions import ConceptNotBelongsToUser
        raise ConceptNotBelongsToUser("El concepto no pertenece al usuario")

    check_type(concept, tx_type)
    return concept


def check_type(concept: Concept, tx_type: str) -> None:
    tx_type = getattr(tx_type, "value", tx_type)
    if concept.is_refund:
        # Un reintegro es plata que vuelve: solo se carga como ingreso
        if tx_type != "income":
            raise ConceptTypeMismatch(
                f"{concept.name} es un reintegro: se carga como ingreso (resta del gasto de "
                f"{concept.category.name})."
            )
        return
    allowed = TX_TYPE_TO_KINDS.get(tx_type)
    kind = concept.category.kind if concept.category else "any"
    if allowed and kind not in allowed:
        raise ConceptTypeMismatch(
            f"El concepto {concept.name} es de la categoría {concept.category.name}, "
            f"que no se usa para {_TYPE_LABELS.get(tx_type, tx_type)}. "
            f"Elegí otro concepto o cambiá el tipo de la categoría."
        )


def get_or_create_default(db: Session, user_id: uuid.UUID, category: Category) -> Concept:
    """
    Concepto genérico de una categoría, para movimientos que llegan sin concepto
    (importaciones). Se llama como la categoría; si ese nombre ya lo usa un
    concepto de otra categoría, se agrega " (general)".
    """
    name = normalize_concept(category.name)[:100]
    existing = concept_crud.get_by_name_and_user(db, name, user_id)
    if existing and existing.category_id == category.id:
        return existing
    if existing:
        name = normalize_concept(f"{category.name} (general)")[:100]
        existing = concept_crud.get_by_name_and_user(db, name, user_id)
        if existing:
            return existing
    return concept_crud.create(db, user_id=user_id, name=name, category_id=category.id)


def get_transfer_default(db: Session, user_id: uuid.UUID) -> Concept:
    """Concepto "Transferencia" (categoría del sistema "Transacciones")."""
    concept = concept_crud.get_by_name_and_user(db, "Transferencia", user_id)
    if concept:
        return concept
    cat = category_crud.get_by_slug_and_user(db, "transacciones", user_id)
    if cat is None:
        cat = category_crud.create(
            db, user_id=user_id, name="Transacciones", slug="transacciones",
            icon="arrow-left-right", color="#94A3B8", is_system=True, kind="transfer",
        )
    return concept_crud.create(db, user_id=user_id, name="Transferencia", is_system=True, category_id=cat.id)
