import uuid
from decimal import Decimal
from sqlalchemy.orm import Session

from app.crud import household_crud, exchange_rate_crud
from app.exceptions.household_exceptions import HouseholdNotFound, UnauthorizedHouseholdAccess
from app.models.household_models import MemberStatus, SplitType
from app.models.transactions_models import Transaction, TransactionType
from app.models.users_models import User
from app.schemas.household_schema import (
    HouseholdAnalyticsResponse, MemberContribution,
    SettlementItem, SharedExpense, HouseholdAlert, CategoryBreakdown,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_user_name(db: Session, user_id: uuid.UUID) -> str:
    user = db.query(User).filter(User.id == user_id).first()
    return user.name if user else str(user_id)


def _get_incomes(db: Session, user_id: uuid.UUID, year: int, month: int) -> Decimal:
    """Sum of income transactions for a user in a given month."""
    from datetime import date
    date_from = date(year, month, 1)
    import calendar
    last_day = calendar.monthrange(year, month)[1]
    date_to = date(year, month, last_day)

    rows = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.type == TransactionType.INCOME,
            Transaction.is_deleted == False,
            Transaction.date >= date_from,
            Transaction.date <= date_to,
        )
        .all()
    )
    return sum((tx.amount for tx in rows), Decimal("0.00"))


def _convert_to_base(
    db: Session,
    amount: Decimal,
    from_currency: str,
    base_currency: str,
    user_id: uuid.UUID,
) -> tuple[Decimal, bool]:
    """
    Returns (converted_amount, ok).
    ok=False means the rate was missing.
    """
    if from_currency == base_currency:
        return amount, True
    rate = exchange_rate_crud.get_latest(db, user_id, from_currency, base_currency)
    if not rate:
        return amount, False
    return (amount * rate.rate).quantize(Decimal("0.01")), True


def _simplify_debts(balances: dict[uuid.UUID, Decimal]) -> list[tuple[uuid.UUID, uuid.UUID, Decimal]]:
    """
    Greedy debt simplification.
    Returns list of (debtor_id, creditor_id, amount).
    """
    creditors = sorted(
        [(v, k) for k, v in balances.items() if v > 0], reverse=True
    )
    debtors = sorted(
        [(v, k) for k, v in balances.items() if v < 0]
    )
    result = []
    while creditors and debtors:
        credit_amt, creditor = creditors.pop(0)
        debt_amt,   debtor   = debtors.pop(0)
        settled = min(credit_amt, abs(debt_amt))
        result.append((debtor, creditor, settled.quantize(Decimal("0.01"))))
        remainder_credit = credit_amt - settled
        remainder_debt   = abs(debt_amt) - settled
        if remainder_credit > Decimal("0.01"):
            creditors.insert(0, (remainder_credit, creditor))
        if remainder_debt > Decimal("0.01"):
            debtors.insert(0, (-remainder_debt, debtor))
    return result


# ---------------------------------------------------------------------------
# Main analytics function
# ---------------------------------------------------------------------------

def get_analytics(
    db: Session,
    user: User,
    household_id: uuid.UUID,
    year: int,
    month: int,
) -> HouseholdAnalyticsResponse:
    from app.exceptions.household_exceptions import UnauthorizedHouseholdAccess

    household = household_crud.get_by_id(db, household_id)
    if not household:
        raise HouseholdNotFound("Hogar no encontrado")

    member = household_crud.get_member(db, household_id, user.id)
    if not member or member.status != MemberStatus.ACTIVE:
        raise UnauthorizedHouseholdAccess("No sos miembro activo de este hogar")

    active_members = household_crud.get_active_members(db, household_id)
    member_ids = [m.user_id for m in active_members]
    base_currency = household.base_currency
    period = f"{year}-{month:02d}"
    alerts: list[HouseholdAlert] = []

    # ── Shared expenses for the period ──────────────────────────────────────
    shared_txs = (
        db.query(Transaction)
        .filter(
            Transaction.household_id == household_id,
            Transaction.is_deleted == False,
        )
        .all()
    )
    shared_txs = [
        tx for tx in shared_txs
        if tx.date.year == year and tx.date.month == month
    ]

    # ── Convert expenses to base currency ───────────────────────────────────
    # expenses_paid[user_id] = total paid in base currency
    expenses_paid: dict[uuid.UUID, Decimal] = {uid: Decimal("0.00") for uid in member_ids}
    missing_currencies: set[str] = set()

    shared_expense_list: list[SharedExpense] = []
    for tx in shared_txs:
        # Determine currency from account
        account_currency = tx.account.currency if tx.account else base_currency
        converted, ok = _convert_to_base(db, tx.amount, account_currency, base_currency, tx.user_id)
        if not ok:
            missing_currencies.add(account_currency)
        if tx.user_id in expenses_paid:
            expenses_paid[tx.user_id] += converted

        shared_expense_list.append(SharedExpense(
            transaction_id=tx.id,
            date=str(tx.date),
            concept_name=tx.concept.name if tx.concept else "",
            category_name=tx.category.name if tx.category else "",
            amount=tx.amount,
            currency=account_currency,
            paid_by_user_id=tx.user_id,
            paid_by_user_name=_get_user_name(db, tx.user_id),
        ))

    for cur in missing_currencies:
        alerts.append(HouseholdAlert(
            type="missing_rate",
            message=f"Falta la tasa {cur}/{base_currency}. El cálculo de liquidación puede ser incompleto.",
            currency=cur,
        ))

    # ── Incomes per member ───────────────────────────────────────────────────
    incomes: dict[uuid.UUID, Decimal] = {}
    for uid in member_ids:
        inc = _get_incomes(db, uid, year, month)
        incomes[uid] = inc

    total_group_income = sum(incomes.values(), Decimal("0.00"))
    total_shared = sum(expenses_paid.values(), Decimal("0.00"))

    # ── Split calculation ────────────────────────────────────────────────────
    should_pay: dict[uuid.UUID, Decimal] = {}

    if household.split_type == SplitType.EQUAL:
        n = len(member_ids)
        per_member = (total_shared / n).quantize(Decimal("0.01")) if n > 0 else Decimal("0.00")
        should_pay = {uid: per_member for uid in member_ids}

    else:  # PROPORTIONAL
        # Exclude members with no income
        eligible = {uid: inc for uid, inc in incomes.items() if inc > 0}
        if not eligible:
            # Fallback to equal if nobody has income
            n = len(member_ids)
            per_member = (total_shared / n).quantize(Decimal("0.01")) if n > 0 else Decimal("0.00")
            should_pay = {uid: per_member for uid in member_ids}
        else:
            eligible_total = sum(eligible.values(), Decimal("0.00"))
            for uid in member_ids:
                if uid in eligible:
                    pct = eligible[uid] / eligible_total
                    should_pay[uid] = (total_shared * pct).quantize(Decimal("0.01"))
                else:
                    should_pay[uid] = Decimal("0.00")
                    alerts.append(HouseholdAlert(
                        type="no_income",
                        message=f"{_get_user_name(db, uid)} no tiene ingresos registrados este período — excluido del cálculo proporcional.",
                        user_id=uid,
                    ))

    # ── Balance & settlement ─────────────────────────────────────────────────
    balances: dict[uuid.UUID, Decimal] = {
        uid: expenses_paid[uid] - should_pay[uid]
        for uid in member_ids
    }
    raw_settlement = _simplify_debts(balances)

    settlement_list: list[SettlementItem] = [
        SettlementItem(
            from_user_id=debtor,
            from_user_name=_get_user_name(db, debtor),
            to_user_id=creditor,
            to_user_name=_get_user_name(db, creditor),
            amount=amount,
            currency=base_currency,
        )
        for debtor, creditor, amount in raw_settlement
    ]

    # ── Member contributions ─────────────────────────────────────────────────
    contributions: list[MemberContribution] = []
    for m in active_members:
        uid = m.user_id
        inc = incomes.get(uid, Decimal("0.00"))
        inc_pct = (
            (inc / total_group_income * 100).quantize(Decimal("0.01"))
            if total_group_income > 0 else Decimal("0.00")
        )
        contributions.append(MemberContribution(
            user_id=uid,
            user_name=_get_user_name(db, uid),
            income_pct=inc_pct,
            expenses_paid=expenses_paid.get(uid, Decimal("0.00")),
            should_pay=should_pay.get(uid, Decimal("0.00")),
            balance=balances.get(uid, Decimal("0.00")),
        ))

    # ── Category breakdown ───────────────────────────────────────────────────
    category_totals: dict[str, Decimal] = {}
    for tx in shared_txs:
        cat_name = tx.category.name if tx.category else "Sin categoría"
        account_currency = tx.account.currency if tx.account else base_currency
        converted, _ = _convert_to_base(db, tx.amount, account_currency, base_currency, tx.user_id)
        category_totals[cat_name] = category_totals.get(cat_name, Decimal("0.00")) + converted

    expense_by_category = [
        CategoryBreakdown(
            category_name=name,
            total=total.quantize(Decimal("0.01")),
            currency=base_currency,
        )
        for name, total in sorted(category_totals.items(), key=lambda x: x[1], reverse=True)
    ]

    # ── Pending member alerts ────────────────────────────────────────────────
    pending = household_crud.get_pending_members(db, household_id)
    for p in pending:
        alerts.append(HouseholdAlert(
            type="pending_member",
            message=f"{_get_user_name(db, p.user_id)} quiere unirse al hogar. Aprobá su solicitud.",
            user_id=p.user_id,
        ))

    return HouseholdAnalyticsResponse(
        household_id=household_id,
        period=period,
        split_type=household.split_type,
        members=contributions,
        shared_expenses=shared_expense_list,
        settlement=settlement_list,
        alerts=alerts,
        expense_by_category=expense_by_category,
        total_shared=total_shared.quantize(Decimal("0.01")),
        base_currency=base_currency,
    )
