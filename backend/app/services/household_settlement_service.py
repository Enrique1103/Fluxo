"""
Pago del balanceo mensual del hogar.

La liquidación de Hogar dice, por ejemplo, "Luis le debe a Papá $3.500".
- El que debe registra el pago eligiendo de qué cuenta sale: se le carga un gasto
  "Balanceo del Hogar" (no es gasto compartido, así no entra en el reparto).
- El que cobra confirma a qué cuenta entró: se le carga el ingreso "Reintegro del
  Hogar", que es un reintegro (resta de su gasto en vez de sumar ingreso).
- Mientras el gasto del que paga no esté borrado, el pago cuenta en la liquidación
  de ese mes, así la deuda vuelve a cero.
"""
import calendar
import uuid
from decimal import Decimal

from sqlalchemy.orm import Session

from app.crud import category_crud, concept_crud, household_crud
from app.exceptions.household_exceptions import (
    HouseholdNotFound,
    SettlementNotAllowed,
    SettlementNotFound,
    UnauthorizedHouseholdAccess,
)
from app.models.concepts_models import Concept
from app.models.household_models import HouseholdSettlement, MemberStatus
from app.models.transactions_models import Transaction, TransactionType
from app.models.users_models import User
from app.schemas.household_schema import SettlementConfirmIn, SettlementPayIn
from app.schemas.transaction_schema import TransactionCreate

PAY_CONCEPT = "Balanceo del Hogar"
REFUND_CONCEPT = "Reintegro del Hogar"
_MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto",
           "septiembre", "octubre", "noviembre", "diciembre"]


def _check_member(db: Session, household_id: uuid.UUID, user_id: uuid.UUID):
    household = household_crud.get_by_id(db, household_id)
    if not household or household.is_deleted:
        raise HouseholdNotFound("Hogar no encontrado")
    member = household_crud.get_member(db, household_id, user_id)
    if not member or member.status != MemberStatus.ACTIVE:
        raise UnauthorizedHouseholdAccess("No sos miembro activo de este hogar")
    return household


def _home_category(db: Session, user_id: uuid.UUID):
    for slug in ("hogar", "vivienda", "gastos-asociados-al-hogar"):
        cat = category_crud.get_by_slug_and_user(db, slug, user_id)
        if cat:
            return cat
    return category_crud.create(
        db, user_id=user_id, name="Hogar", slug="hogar", icon="home", color="#14B8A6", kind="expense",
    )


def _concept(db: Session, user_id: uuid.UUID, name: str, is_refund: bool) -> Concept:
    concept = concept_crud.get_by_name_and_user(db, name, user_id)
    if concept is None:
        concept = concept_crud.create(
            db, user_id=user_id, name=name, category_id=_home_category(db, user_id).id, is_refund=is_refund,
        )
    elif is_refund and not concept.is_refund:
        concept.is_refund = True
    db.flush()
    return concept


def _in_account_currency(db: Session, user_id: uuid.UUID, amount: Decimal, base: str, account, on_date) -> Decimal:
    if str(account.currency) == base:
        return amount
    from app.exceptions.exchange_rate_exceptions import ExchangeRateMissing
    from app.services import exchange_rate_service
    rate = exchange_rate_service.get_rate_nearest(db, user_id, base, str(account.currency), on_date.year, on_date.month)
    if rate is None:
        raise ExchangeRateMissing(
            f"No hay tasa {base}→{account.currency} cargada. Cargala o elegí una cuenta en {base}."
        )
    return (amount * rate).quantize(Decimal("0.01"))


def is_active(s: HouseholdSettlement) -> bool:
    """El pago cuenta mientras exista el gasto del que pagó."""
    return s.payer_tx is not None and not s.payer_tx.is_deleted


def is_confirmed(s: HouseholdSettlement) -> bool:
    return s.receiver_tx is not None and not s.receiver_tx.is_deleted


def active_for_period(db: Session, household_id: uuid.UUID, year: int, month: int) -> list[HouseholdSettlement]:
    rows = (
        db.query(HouseholdSettlement)
        .filter(
            HouseholdSettlement.household_id == household_id,
            HouseholdSettlement.year == year,
            HouseholdSettlement.month == month,
        )
        .order_by(HouseholdSettlement.created_at)
        .all()
    )
    return [s for s in rows if is_active(s)]


def pay(db: Session, user: User, household_id: uuid.UUID, data: SettlementPayIn) -> HouseholdSettlement:
    household = _check_member(db, household_id, user.id)
    to_member = household_crud.get_member(db, household_id, data.to_user_id)
    if not to_member or to_member.status != MemberStatus.ACTIVE or data.to_user_id == user.id:
        raise SettlementNotAllowed("Esa persona no es miembro activo del hogar")

    # El monto lo calcula la liquidación del mes (no se escribe a mano)
    from app.services import household_analytics_service
    analytics = household_analytics_service.get_analytics(db, user, household_id, data.year, data.month)
    item = next(
        (x for x in analytics.settlement if x.from_user_id == user.id and x.to_user_id == data.to_user_id),
        None,
    )
    if item is None or item.amount <= 0:
        raise SettlementNotAllowed("Este mes no tenés nada pendiente para pagarle a esa persona")

    from app.services import transaction_service
    account = transaction_service._get_account(db, data.account_id, user.id)
    concept = _concept(db, user.id, PAY_CONCEPT, is_refund=False)
    amount = _in_account_currency(db, user.id, item.amount, household.base_currency, account, data.date)
    tx = transaction_service.create(db, user, TransactionCreate(
        account_id=account.id,
        concept_id=concept.id,
        amount=amount,
        type="expense",
        date=data.date,
        description=(data.comment or f"Balanceo {_MONTHS[data.month - 1]} {data.year}")[:100],
    ))

    settlement = HouseholdSettlement(
        household_id=household_id,
        year=data.year,
        month=data.month,
        from_user_id=user.id,
        to_user_id=data.to_user_id,
        amount=item.amount,
        currency=household.base_currency,
        paid_date=data.date,
        comment=data.comment,
        payer_tx_id=tx.id,
    )
    db.add(settlement)
    db.commit()
    db.refresh(settlement)
    return settlement


def confirm(
    db: Session, user: User, household_id: uuid.UUID, settlement_id: uuid.UUID, data: SettlementConfirmIn,
) -> HouseholdSettlement:
    household = _check_member(db, household_id, user.id)
    s = db.query(HouseholdSettlement).filter(
        HouseholdSettlement.id == settlement_id, HouseholdSettlement.household_id == household_id,
    ).first()
    if not s or not is_active(s):
        raise SettlementNotFound("Pago no encontrado")
    if s.to_user_id != user.id:
        raise SettlementNotAllowed("Solo quien recibe el pago puede confirmarlo")
    if is_confirmed(s):
        raise SettlementNotAllowed("Este pago ya está confirmado")

    from app.services import transaction_service
    account = transaction_service._get_account(db, data.account_id, user.id)
    on_date = data.date or s.paid_date
    concept = _concept(db, user.id, REFUND_CONCEPT, is_refund=True)
    amount = _in_account_currency(db, user.id, s.amount, household.base_currency, account, on_date)
    payer_name = household_crud_user_name(db, s.from_user_id)
    tx = transaction_service.create(db, user, TransactionCreate(
        account_id=account.id,
        concept_id=concept.id,
        amount=amount,
        type="income",
        date=on_date,
        description=(s.comment or f"Balanceo {_MONTHS[s.month - 1]} {s.year} de {payer_name}")[:100],
    ))
    s.receiver_tx_id = tx.id
    db.commit()
    db.refresh(s)
    return s


def household_crud_user_name(db: Session, user_id: uuid.UUID) -> str:
    from app.crud import user_crud
    u = user_crud.get_by_id(db, user_id)
    return u.name if u else "otro miembro"


def month_label(year: int, month: int) -> str:
    return f"{_MONTHS[month - 1]} {year}"


__all__ = ["pay", "confirm", "active_for_period", "is_active", "is_confirmed", "calendar"]
