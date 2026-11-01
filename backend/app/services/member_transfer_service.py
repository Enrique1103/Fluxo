"""
Transferencias de dinero entre miembros del hogar (Nivel 3 / FULL).

El que envía elige su cuenta de origen y la cuenta de destino del receptor.
Se crean dos transacciones inmediatamente:
  - Egreso en la cuenta del emisor
  - Ingreso en la cuenta del receptor
Ambas transacciones son personales (no compartidas con el hogar).
El monto se registra en member_transfers para ajustar el balance mensual.
"""
import uuid
from datetime import date as PyDate
from decimal import Decimal

from sqlalchemy.orm import Session

from app.crud import category_crud, concept_crud, household_crud
from app.exceptions.household_exceptions import (
    HouseholdNotFound,
    SettlementNotAllowed,
    UnauthorizedHouseholdAccess,
)
from app.models.household_models import AnalysisLevel, MemberStatus, MemberTransfer
from app.models.users_models import User
from app.schemas.transaction_schema import TransactionCreate


TRANSFER_CONCEPT = "Transferencia entre miembros"
_MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
           "septiembre", "octubre", "noviembre", "diciembre"]


def _check_member(db: Session, household_id: uuid.UUID, user_id: uuid.UUID):
    household = household_crud.get_by_id(db, household_id)
    if not household or household.is_deleted:
        raise HouseholdNotFound("Hogar no encontrado")
    member = household_crud.get_member(db, household_id, user_id)
    if not member or member.status != MemberStatus.ACTIVE:
        raise UnauthorizedHouseholdAccess("No sos miembro activo de este hogar")
    level = household.analysis_level or AnalysisLevel.EXPENSES_ONLY
    if level != AnalysisLevel.FULL:
        raise SettlementNotAllowed("Las transferencias entre miembros solo están disponibles en hogares de Nivel 3")
    return household


def _home_category(db: Session, user_id: uuid.UUID):
    for slug in ("hogar", "vivienda", "gastos-asociados-al-hogar"):
        cat = category_crud.get_by_slug_and_user(db, slug, user_id)
        if cat:
            return cat
    return category_crud.create(
        db, user_id=user_id, name="Hogar", slug="hogar", icon="home", color="#14B8A6", kind="any",
    )


def _concept(db: Session, user_id: uuid.UUID, name: str) -> object:
    concept = concept_crud.get_by_name_and_user(db, name, user_id)
    if concept is None:
        concept = concept_crud.create(
            db, user_id=user_id, name=name, category_id=_home_category(db, user_id).id, is_refund=False,
        )
    db.flush()
    return concept


def create(
    db: Session,
    actor: User,
    household_id: uuid.UUID,
    to_user_id: uuid.UUID,
    from_account_id: uuid.UUID,
    to_account_id: uuid.UUID,
    amount: Decimal,
    currency: str,
    date: PyDate,
    description: str | None,
) -> MemberTransfer:
    household = _check_member(db, household_id, actor.id)
    to_member = household_crud.get_member(db, household_id, to_user_id)
    if not to_member or to_member.status != MemberStatus.ACTIVE or to_user_id == actor.id:
        raise SettlementNotAllowed("Esa persona no es miembro activo del hogar")

    from app.crud import user_crud
    to_user = user_crud.get_by_id(db, to_user_id)
    to_name = to_user.name if to_user else "otro miembro"

    from app.services import transaction_service
    # Egreso en la cuenta del emisor
    from_concept = _concept(db, actor.id, TRANSFER_CONCEPT)
    from_tx = transaction_service.create(db, actor, TransactionCreate(
        account_id=from_account_id,
        concept_id=from_concept.id,
        amount=amount,
        type="expense",
        date=date,
        description=(description or f"Transferencia a {to_name}")[:100],
    ))

    # Ingreso en la cuenta del receptor (creado como si fuera el receptor)
    to_user_obj = to_user
    if to_user_obj is None:
        raise SettlementNotAllowed("Usuario receptor no encontrado")
    to_concept = _concept(db, to_user_id, TRANSFER_CONCEPT)
    to_tx = transaction_service.create(db, to_user_obj, TransactionCreate(
        account_id=to_account_id,
        concept_id=to_concept.id,
        amount=amount,
        type="income",
        date=date,
        description=(description or f"Transferencia de {actor.name}")[:100],
    ))

    transfer = MemberTransfer(
        household_id=household_id,
        from_user_id=actor.id,
        to_user_id=to_user_id,
        amount=amount,
        currency=currency,
        date=date,
        description=description,
        from_tx_id=from_tx.id,
        to_tx_id=to_tx.id,
    )
    db.add(transfer)
    db.commit()
    db.refresh(transfer)
    return transfer


def update(
    db: Session,
    actor: User,
    household_id: uuid.UUID,
    transfer_id: uuid.UUID,
    amount: Decimal | None,
    currency: str | None,
    date: PyDate | None,
    description: str | None,
) -> MemberTransfer:
    _check_member(db, household_id, actor.id)
    t = db.query(MemberTransfer).filter(
        MemberTransfer.id == transfer_id,
        MemberTransfer.household_id == household_id,
    ).first()
    if not t:
        from app.exceptions.household_exceptions import SettlementNotFound
        raise SettlementNotFound("Transferencia no encontrada")
    if t.from_user_id != actor.id:
        raise SettlementNotAllowed("Solo quien envió la transferencia puede editarla")

    from app.models.transactions_models import Transaction
    if amount is not None:
        t.amount = amount
        for tx_id in [t.from_tx_id, t.to_tx_id]:
            if tx_id:
                tx = db.query(Transaction).filter(Transaction.id == tx_id).first()
                if tx and not tx.is_deleted:
                    tx.amount = amount
    if currency is not None:
        t.currency = currency
    if date is not None:
        t.date = date
        for tx_id in [t.from_tx_id, t.to_tx_id]:
            if tx_id:
                tx = db.query(Transaction).filter(Transaction.id == tx_id).first()
                if tx and not tx.is_deleted:
                    tx.date = date
    if description is not None:
        t.description = description if description.strip() else None
        if t.from_tx_id:
            tx = db.query(Transaction).filter(Transaction.id == t.from_tx_id).first()
            if tx and not tx.is_deleted and description.strip():
                tx.description = description.strip()[:100]
        if t.to_tx_id:
            tx = db.query(Transaction).filter(Transaction.id == t.to_tx_id).first()
            if tx and not tx.is_deleted and description.strip():
                tx.description = description.strip()[:100]
    db.commit()
    db.refresh(t)
    return t


def list_for_period(
    db: Session, household_id: uuid.UUID, year: int, month: int
) -> list[MemberTransfer]:
    from datetime import date
    import calendar as _cal
    start = date(year, month, 1)
    end = date(year, month, _cal.monthrange(year, month)[1])
    return (
        db.query(MemberTransfer)
        .filter(
            MemberTransfer.household_id == household_id,
            MemberTransfer.date >= start,
            MemberTransfer.date <= end,
        )
        .order_by(MemberTransfer.date.desc(), MemberTransfer.created_at.desc())
        .all()
    )


def delete(db: Session, actor: User, household_id: uuid.UUID, transfer_id: uuid.UUID) -> None:
    _check_member(db, household_id, actor.id)
    t = db.query(MemberTransfer).filter(
        MemberTransfer.id == transfer_id,
        MemberTransfer.household_id == household_id,
    ).first()
    if not t:
        from app.exceptions.household_exceptions import SettlementNotFound
        raise SettlementNotFound("Transferencia no encontrada")
    if t.from_user_id != actor.id:
        raise SettlementNotAllowed("Solo quien envió la transferencia puede eliminarla")
    # Eliminar transacciones
    from app.models.transactions_models import Transaction
    for tx_id in [t.from_tx_id, t.to_tx_id]:
        if tx_id:
            tx = db.query(Transaction).filter(Transaction.id == tx_id).first()
            if tx and not tx.is_deleted:
                from datetime import datetime, timezone
                tx.is_deleted = True
                tx.deleted_at = datetime.now(timezone.utc)
    db.delete(t)
    db.commit()
