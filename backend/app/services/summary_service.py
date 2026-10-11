from datetime import date, timedelta
from decimal import Decimal
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.crud import account_crud
from app.models.accounts_models import Account, AccountType
from app.models.transactions_models import Transaction, TransactionType, TransferRole
from app.models.users_models import User
from app.schemas.summary_schema import SummaryResponse, AccountSummary, CategoryBreakdown
from app.services import exchange_rate_service, monthly_total_service


def get_summary(db: Session, user: User, display_currency: str | None = None) -> SummaryResponse:
    accounts = account_crud.get_all_by_user(db, user.id)
    target_currency = display_currency or str(user.currency_default)
    today = date.today()

    # --- Net worth (converted to target_currency) ---
    total_assets = Decimal("0.00")
    total_debt   = Decimal("0.00")

    for a in accounts:
        acc_cur = str(a.currency)
        balance = Decimal(str(a.balance))
        if acc_cur != target_currency:
            rate = exchange_rate_service.get_rate_for_month(
                db, user.id, acc_cur, target_currency, today.year, today.month
            )
            if rate is not None:
                balance = balance * rate
            else:
                balance = Decimal("0.00")  # skip accounts without rate
        if a.type != AccountType.CREDIT:
            total_assets += balance
        else:
            total_debt += balance

    net_worth = total_assets + total_debt

    account_summaries = [
        AccountSummary(
            id=a.id,
            name=a.name,
            type=a.type,
            currency=a.currency,
            balance=a.balance,
            credit_limit=a.credit_limit,
        )
        for a in accounts
        if not a.is_archived
    ]

    # --- Current month range (full month, including future-dated transactions) ---
    from calendar import monthrange as _monthrange
    month_start = today.replace(day=1)
    month_end = today.replace(day=_monthrange(today.year, today.month)[1])

    # Ingresos/gastos del mes convertidos a target_currency con la tasa del mes
    # (antes se sumaban montos de cuentas en distintas monedas sin convertir).
    from app.models.categories_models import Category

    rows = (
        db.query(
            Transaction.type,
            Transaction.amount,
            Transaction.commission,
            Transaction.external_account_id,
            Transaction.date,
            Account.currency,
            Category.name,
        )
        .join(Account, Transaction.account_id == Account.id)
        .outerjoin(Category, Transaction.category_id == Category.id)
        .filter(
            Transaction.user_id == user.id,
            Transaction.is_deleted == False,
            or_(Transaction.transfer_role.is_(None), Transaction.transfer_role == TransferRole.SOURCE),
            Transaction.date >= month_start,
            Transaction.date <= month_end,
        )
        .all()
    )

    rate_cache: dict[str, Decimal] = {}

    def _to_target(amount, currency, tx_date) -> Decimal:
        cur = str(currency)
        if cur == target_currency:
            return Decimal(str(amount))
        if cur not in rate_cache:
            rate = exchange_rate_service.get_rate_nearest(
                db, user.id, cur, target_currency, tx_date.year, tx_date.month
            )
            rate_cache[cur] = rate if rate is not None else Decimal("1")
        return Decimal(str(amount)) * rate_cache[cur]

    income_this_month = Decimal("0.00")
    expense_this_month = Decimal("0.00")
    by_category: dict[str, Decimal] = {}
    for tx_type, amount, commission, ext_acc_id, tx_date, currency, cat_name in rows:
        if tx_type == TransactionType.INCOME:
            income_this_month += _to_target(amount, currency, tx_date)
        elif tx_type == TransactionType.EXPENSE:
            converted = _to_target(amount, currency, tx_date)
            expense_this_month += converted
            if tx_date <= today and cat_name is not None:
                by_category[cat_name] = by_category.get(cat_name, Decimal("0.00")) + converted
        elif tx_type == TransactionType.TRANSFER:
            # Igual que el gráfico Ingresos·Gastos: transferencia externa y comisiones son salida
            outflow = Decimal(str(commission or 0)) + (Decimal(str(amount)) if ext_acc_id else Decimal("0"))
            if outflow:
                expense_this_month += _to_target(outflow, currency, tx_date)

    # Total mensual importado del mes en curso (si lo hubiera)
    for _, cur, inc, exp in monthly_total_service.totals_by_month(db, user.id, month_start, month_start):
        income_this_month += _to_target(inc, cur, month_start)
        expense_this_month += _to_target(exp, cur, month_start)

    expense_by_category = [
        CategoryBreakdown(category_name=name, total=total.quantize(Decimal("0.01")))
        for name, total in sorted(by_category.items(), key=lambda kv: kv[1], reverse=True)
    ]
    income_this_month = income_this_month.quantize(Decimal("0.01"))
    expense_this_month = expense_this_month.quantize(Decimal("0.01"))

    first_tx = (
        db.query(func.min(Transaction.date))
        .filter(
            Transaction.user_id == user.id,
            Transaction.is_deleted == False,
        )
        .scalar()
    )
    first_tx_month = first_tx.strftime("%Y-%m") if first_tx else None
    # Los totales mensuales importados también son historial: el gráfico arranca desde el más viejo
    imported = monthly_total_service.get_all(db, user)
    if imported:
        oldest = f"{imported[-1].year}-{imported[-1].month:02d}"
        first_tx_month = min(first_tx_month, oldest) if first_tx_month else oldest

    return SummaryResponse(
        net_worth=net_worth,
        total_assets=total_assets,
        total_debt=total_debt,
        income_this_month=income_this_month,
        expense_this_month=expense_this_month,
        net_this_month=income_this_month - expense_this_month,
        accounts=account_summaries,
        expense_by_category=expense_by_category,
        first_tx_month=first_tx_month,
    )
