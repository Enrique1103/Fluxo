import calendar as cal_module
import uuid
from datetime import date as PyDate
from decimal import Decimal
from sqlalchemy.orm import Session, joinedload

from app.crud import household_crud
from app.services import exchange_rate_service
from app.exceptions.household_exceptions import HouseholdNotFound, UnauthorizedHouseholdAccess
from app.models.household_models import MemberStatus, SplitType, AnalysisLevel
from app.models.transactions_models import Transaction, TransactionHousehold, TransactionType
from app.models.users_models import User
from app.schemas.household_schema import (
    HouseholdAnalyticsResponse, MemberContribution,
    SettlementItem, SettlementPayment, SharedExpense, HouseholdAlert, CategoryBreakdown,
    ConceptBreakdown, MemberIncome, MemberTransaction,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_user_name(db: Session, user_id: uuid.UUID) -> str:
    user = db.query(User).filter(User.id == user_id).first()
    return user.name if user else str(user_id)


def _get_incomes(
    db: Session, user_id: uuid.UUID, year: int, month: int, base_currency: str,
) -> tuple[Decimal, set[str]]:
    """
    Ingresos del usuario en el mes, convertidos a la moneda base del hogar.
    Excluye patas de transferencias. Devuelve (total, monedas sin tasa).
    """
    from datetime import date
    import calendar
    date_from = date(year, month, 1)
    date_to = date(year, month, calendar.monthrange(year, month)[1])

    rows = (
        db.query(Transaction)
        .options(joinedload(Transaction.account))
        .filter(
            Transaction.user_id == user_id,
            Transaction.type == TransactionType.INCOME,
            Transaction.is_refund == False,  # noqa: E712 — un reintegro no es ingreso
            Transaction.transfer_role.is_(None),
            Transaction.is_deleted == False,
            Transaction.date >= date_from,
            Transaction.date <= date_to,
        )
        .all()
    )
    total, missing = Decimal("0.00"), set()
    for tx in rows:
        cur = tx.account.currency if tx.account else base_currency
        converted, ok = _convert_to_base(db, tx.amount, cur, base_currency, user_id, tx.date)
        if not ok:
            missing.add(cur)
        total += converted
    return total, missing


def _convert_to_base(
    db: Session,
    amount: Decimal,
    from_currency: str,
    base_currency: str,
    user_id: uuid.UUID,
    on_date: PyDate | None = None,
) -> tuple[Decimal, bool]:
    """
    Returns (converted_amount, ok). ok=False means the rate was missing.
    Usa la tasa del mes del movimiento (o la más cercana), en cualquier sentido del par.
    """
    if from_currency == base_currency:
        return amount, True
    d = on_date or PyDate.today()
    rate = exchange_rate_service.get_rate_nearest(db, user_id, from_currency, base_currency, d.year, d.month)
    if rate is None:
        return amount, False
    return (amount * rate).quantize(Decimal("0.01")), True


def _split(total: Decimal, weights: dict[uuid.UUID, Decimal]) -> dict[uuid.UUID, Decimal]:
    """
    Reparte `total` según `weights` en centavos exactos: la suma de las partes es
    igual al total (los centavos del redondeo van a las partes con mayor resto).
    """
    if not weights:
        return {}
    weight_sum = sum(weights.values(), Decimal("0"))
    cents = int((total * 100).quantize(Decimal("1")))
    raw = {uid: Decimal(cents) * w / weight_sum for uid, w in weights.items()}
    parts = {uid: int(v) for uid, v in raw.items()}  # floor (todo positivo)
    leftover = cents - sum(parts.values())
    for uid in sorted(raw, key=lambda u: raw[u] - parts[u], reverse=True)[:leftover]:
        parts[uid] += 1
    return {uid: Decimal(c) / 100 for uid, c in parts.items()}


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

    # ── Shared expenses for the period (F04: via junction table) ────────────
    date_from = PyDate(year, month, 1)
    date_to   = PyDate(year, month, cal_module.monthrange(year, month)[1])

    shared_txs = (
        db.query(Transaction)
        .options(joinedload(Transaction.account))
        .join(TransactionHousehold, TransactionHousehold.transaction_id == Transaction.id)
        .filter(
            TransactionHousehold.household_id == household_id,
            Transaction.user_id.in_(member_ids),  # quien ya no es miembro no entra en el reparto
            Transaction.is_deleted == False,
            Transaction.date >= date_from,
            Transaction.date <= date_to,
        )
        .all()
    )

    # ── Convert expenses to base currency ───────────────────────────────────
    # expenses_paid[user_id] = total paid in base currency
    expenses_paid: dict[uuid.UUID, Decimal] = {uid: Decimal("0.00") for uid in member_ids}
    missing_currencies: set[str] = set()

    shared_expense_list: list[SharedExpense] = []
    for tx in shared_txs:
        # Determine currency from account
        account_currency = tx.account.currency if tx.account else base_currency
        converted, ok = _convert_to_base(db, tx.amount, account_currency, base_currency, tx.user_id, tx.date)
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
            account_name=tx.account.name if tx.account else "",
            description=tx.description,
        ))

    # ── Incomes per member ───────────────────────────────────────────────────
    incomes: dict[uuid.UUID, Decimal] = {}
    for uid in member_ids:
        inc, inc_missing = _get_incomes(db, uid, year, month, base_currency)
        incomes[uid] = inc
        missing_currencies |= inc_missing

    for cur in missing_currencies:
        alerts.append(HouseholdAlert(
            type="missing_rate",
            message=f"Falta la tasa {cur}/{base_currency}. El cálculo de liquidación puede ser incompleto.",
            currency=cur,
        ))

    total_group_income = sum(incomes.values(), Decimal("0.00"))
    total_shared = sum(expenses_paid.values(), Decimal("0.00"))

    # ── Split calculation ────────────────────────────────────────────────────
    should_pay: dict[uuid.UUID, Decimal] = {}

    if household.split_type == SplitType.EQUAL:
        should_pay = _split(total_shared, {uid: Decimal("1") for uid in member_ids})

    else:  # PROPORTIONAL
        # Exclude members with no income
        eligible = {uid: inc for uid, inc in incomes.items() if inc > 0}
        if not eligible:
            # Fallback to equal if nobody has income
            should_pay = _split(total_shared, {uid: Decimal("1") for uid in member_ids})
        else:
            should_pay = _split(total_shared, eligible)
            for uid in member_ids:
                if uid not in eligible:
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
    # Pagos del balanceo ya registrados este mes: el que pagó queda "a favor" por ese
    # monto y el que cobró deja de tenerlo pendiente, así la deuda vuelve a cero.
    from app.services import household_settlement_service
    payments = household_settlement_service.active_for_period(db, household_id, year, month)
    for p in payments:
        if p.from_user_id in balances and p.to_user_id in balances:
            balances[p.from_user_id] += p.amount
            balances[p.to_user_id] -= p.amount
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
        # El % del ingreso de cada uno solo se muestra si el reparto es proporcional
        # o el hogar comparte ingresos (FULL); en "partes iguales" es dato privado.
        shares_income = (
            household.split_type == SplitType.PROPORTIONAL
            or (household.analysis_level or AnalysisLevel.EXPENSES_ONLY) == AnalysisLevel.FULL
        )
        inc_pct = (
            (inc / total_group_income * 100).quantize(Decimal("0.01"))
            if total_group_income > 0 and shares_income else Decimal("0.00")
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
        converted, _ = _convert_to_base(db, tx.amount, account_currency, base_currency, tx.user_id, tx.date)
        category_totals[cat_name] = category_totals.get(cat_name, Decimal("0.00")) + converted

    expense_by_category = [
        CategoryBreakdown(
            category_name=name,
            total=total.quantize(Decimal("0.01")),
            currency=base_currency,
        )
        for name, total in sorted(category_totals.items(), key=lambda x: x[1], reverse=True)
    ]

    # ── F01: Daily average ───────────────────────────────────────────────────
    days_in_month = cal_module.monthrange(year, month)[1]
    today = PyDate.today()
    elapsed = today.day if (year == today.year and month == today.month) else days_in_month
    daily_average = (total_shared / elapsed).quantize(Decimal("0.01")) if elapsed > 0 else Decimal("0.00")

    # ── F01: Top concepts ────────────────────────────────────────────────────
    concept_totals: dict[str, Decimal] = {}
    concept_counts: dict[str, int] = {}
    for tx in shared_txs:
        name = tx.concept.name if tx.concept else "Sin concepto"
        account_currency = tx.account.currency if tx.account else base_currency
        converted, _ = _convert_to_base(db, tx.amount, account_currency, base_currency, tx.user_id, tx.date)
        concept_totals[name] = concept_totals.get(name, Decimal("0.00")) + converted
        concept_counts[name] = concept_counts.get(name, 0) + 1

    top_concepts = [
        ConceptBreakdown(
            concept_name=cname,
            total=ctotal.quantize(Decimal("0.01")),
            currency=base_currency,
            transaction_count=concept_counts[cname],
        )
        for cname, ctotal in sorted(concept_totals.items(), key=lambda x: x[1], reverse=True)[:5]
    ]

    # ── F01: Expenses by day (heatmap) ───────────────────────────────────────
    expenses_by_day: dict[int, Decimal] = {}
    for tx in shared_txs:
        day = tx.date.day
        account_currency = tx.account.currency if tx.account else base_currency
        converted, _ = _convert_to_base(db, tx.amount, account_currency, base_currency, tx.user_id, tx.date)
        expenses_by_day[day] = (expenses_by_day.get(day, Decimal("0.00")) + converted).quantize(Decimal("0.01"))

    # ── F01: Previous month total ────────────────────────────────────────────
    prev_year, prev_month_num = (year - 1, 12) if month == 1 else (year, month - 1)
    prev_last_day = cal_module.monthrange(prev_year, prev_month_num)[1]
    prev_date_from = PyDate(prev_year, prev_month_num, 1)
    prev_date_to = PyDate(prev_year, prev_month_num, prev_last_day)

    prev_txs = (
        db.query(Transaction)
        .options(joinedload(Transaction.account))
        .join(TransactionHousehold, TransactionHousehold.transaction_id == Transaction.id)
        .filter(
            TransactionHousehold.household_id == household_id,
            Transaction.user_id.in_(member_ids),
            Transaction.is_deleted == False,
            Transaction.date >= prev_date_from,
            Transaction.date <= prev_date_to,
        )
        .all()
    )
    prev_month_total = Decimal("0.00")
    for tx in prev_txs:
        account_currency = tx.account.currency if tx.account else base_currency
        converted, _ = _convert_to_base(db, tx.amount, account_currency, base_currency, tx.user_id, tx.date)
        prev_month_total += converted
    prev_month_total = prev_month_total.quantize(Decimal("0.01"))

    prev_month_change_pct: Decimal | None = None
    if prev_month_total > 0:
        prev_month_change_pct = (
            (total_shared - prev_month_total) / prev_month_total * 100
        ).quantize(Decimal("0.01"))

    # ── F03: datos adicionales según analysis_level ──────────────────────────
    member_incomes: list[MemberIncome] | None = None
    net_savings: Decimal | None = None
    total_group_income_out: Decimal | None = None
    member_transactions_list: list[MemberTransaction] | None = None

    effective_level = household.analysis_level or AnalysisLevel.EXPENSES_ONLY
    if effective_level == AnalysisLevel.FULL:
        member_incomes = [
            MemberIncome(
                user_id=m.user_id,
                user_name=_get_user_name(db, m.user_id),
                amount=incomes.get(m.user_id, Decimal("0.00")).quantize(Decimal("0.01")),
                currency=base_currency,
            )
            for m in active_members
        ]
        total_group_income_out = total_group_income.quantize(Decimal("0.01"))
        net_savings = (total_group_income - total_shared).quantize(Decimal("0.01"))

        # Todos los movimientos individuales de los miembros en el período
        all_member_txs = (
            db.query(Transaction)
            .options(joinedload(Transaction.account))
            .filter(
                Transaction.user_id.in_(member_ids),
                Transaction.is_deleted == False,
                Transaction.date >= date_from,
                Transaction.date <= date_to,
            )
            .order_by(Transaction.date.desc())
            .all()
        )
        member_transactions_list = [
            MemberTransaction(
                transaction_id=tx.id,
                date=str(tx.date),
                type=tx.type.value,
                concept_name=tx.concept.name if tx.concept else "",
                category_name=tx.category.name if tx.category else "",
                amount=tx.amount,
                currency=tx.account.currency if tx.account else base_currency,
                user_id=tx.user_id,
                user_name=_get_user_name(db, tx.user_id),
                account_name=tx.account.name if tx.account else "",
                description=tx.description,
            )
            for tx in all_member_txs
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
        settlement_payments=[
            SettlementPayment(
                id=p.id,
                from_user_id=p.from_user_id,
                from_user_name=_get_user_name(db, p.from_user_id),
                to_user_id=p.to_user_id,
                to_user_name=_get_user_name(db, p.to_user_id),
                amount=p.amount,
                currency=p.currency,
                paid_date=str(p.paid_date),
                comment=p.comment,
                confirmed=household_settlement_service.is_confirmed(p),
            )
            for p in payments
        ],
        alerts=alerts,
        expense_by_category=expense_by_category,
        total_shared=total_shared.quantize(Decimal("0.01")),
        base_currency=base_currency,
        daily_average=daily_average,
        top_concepts=top_concepts,
        expenses_by_day=expenses_by_day,
        prev_month_total=prev_month_total,
        prev_month_change_pct=prev_month_change_pct,
        analysis_level=effective_level,
        member_incomes=member_incomes,
        net_savings=net_savings,
        total_group_income=total_group_income_out,
        member_transactions=member_transactions_list,
    )
