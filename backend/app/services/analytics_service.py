import uuid
from calendar import monthrange
from datetime import date, timedelta
from decimal import Decimal

import pandas as pd
import plotly.graph_objects as go
from sqlalchemy import or_, func
from sqlalchemy.orm import Session

from sqlalchemy.orm import aliased
from app.models.accounts_models import Account, AccountType
from app.models.categories_models import Category
from app.models.concepts_models import Concept
from app.models.external_account_models import ExternalAccount
from app.models.transactions_models import Transaction, TransactionType, TransferRole
from app.models.users_models import User
from app.schemas.analytics_schema import MonthlyBreakdown, CategoryStat, DailyExpense, MonthlyTx, MonthlyPatrimonio
from app.services import exchange_rate_service
from app.crud import account_crud


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _tx_base(db: Session, user_id: uuid.UUID, date_from: date, date_to: date):
    """Base query: non-deleted, non-DESTINATION, within date range."""
    return (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user_id,
            Transaction.is_deleted == False,
            or_(
                Transaction.transfer_role.is_(None),
                Transaction.transfer_role == TransferRole.SOURCE,
            ),
            Transaction.date >= date_from,
            Transaction.date <= date_to,
        )
    )


def _month_starts(n: int) -> list[date]:
    """Return the first day of the last n months (oldest first)."""
    starts = []
    d = date.today().replace(day=1)
    for _ in range(n):
        starts.append(d)
        d = (d - timedelta(days=1)).replace(day=1)
    return list(reversed(starts))


def _month_starts_range(months_back: int, months_ahead: int) -> list[date]:
    """Return the first day of months from months_back ago to months_ahead in the future."""
    today_start = date.today().replace(day=1)
    starts = []
    # Past months (oldest first)
    d = today_start
    past = []
    for _ in range(months_back):
        past.append(d)
        d = (d - timedelta(days=1)).replace(day=1)
    starts = list(reversed(past))
    # Current month + future months
    d = today_start
    for _ in range(months_ahead + 1):
        if d not in starts:
            starts.append(d)
        d = date(d.year + (d.month // 12), (d.month % 12) + 1, 1)
    return starts


# ---------------------------------------------------------------------------
# Chart 1: Gastos por categoría (donut)
# ---------------------------------------------------------------------------

def expenses_by_category(
    db: Session,
    user: User,
    date_from: date,
    date_to: date,
) -> dict:
    rows = (
        db.query(Category.name, Transaction.amount)
        .join(Transaction, Transaction.category_id == Category.id)
        .filter(
            Transaction.user_id == user.id,
            Transaction.is_deleted == False,
            Transaction.type == TransactionType.EXPENSE,
            Transaction.date >= date_from,
            Transaction.date <= date_to,
            or_(
                Transaction.transfer_role.is_(None),
                Transaction.transfer_role == TransferRole.SOURCE,
            ),
        )
        .all()
    )

    if not rows:
        return go.Figure().to_dict()

    df = pd.DataFrame(rows, columns=["category", "amount"])
    df["amount"] = df["amount"].astype(float)
    grouped = df.groupby("category")["amount"].sum().reset_index()
    grouped = grouped.sort_values("amount", ascending=False)

    fig = go.Figure(
        go.Pie(
            labels=grouped["category"],
            values=grouped["amount"],
            hole=0.45,
            textinfo="label+percent",
        )
    )
    fig.update_layout(
        title=f"Gastos por categoría ({date_from} — {date_to})",
        showlegend=True,
    )
    return fig.to_dict()


# ---------------------------------------------------------------------------
# Chart 2: Ingresos vs egresos por mes (barras agrupadas)
# ---------------------------------------------------------------------------

def income_vs_expenses(db: Session, user: User, months: int = 6, months_ahead: int = 0, display_currency: str | None = None) -> dict:
    target_currency = display_currency or str(user.currency_default)

    starts = _month_starts_range(months, months_ahead)
    date_from = starts[0]
    last_start = starts[-1]
    date_to = last_start.replace(day=monthrange(last_start.year, last_start.month)[1])

    base_filter = [
        Transaction.user_id == user.id,
        Transaction.is_deleted == False,
        Transaction.date >= date_from,
        Transaction.date <= date_to,
        or_(
            Transaction.transfer_role.is_(None),
            Transaction.transfer_role == TransferRole.SOURCE,
        ),
    ]

    # Income and expense transactions — include account currency for conversion
    rows_ie = (
        db.query(Transaction.date, Transaction.type, Transaction.amount, Account.currency)
        .join(Account, Transaction.account_id == Account.id)
        .filter(*base_filter, Transaction.type.in_([TransactionType.INCOME, TransactionType.EXPENSE]))
        .all()
    )

    # External transfers (outflow = treated as expense)
    rows_ext = (
        db.query(Transaction.date, Transaction.amount, Account.currency)
        .join(Account, Transaction.account_id == Account.id)
        .filter(*base_filter, Transaction.external_account_id.isnot(None))
        .all()
    )

    # Build complete month grid so missing months appear as 0
    month_labels = [s.strftime("%Y-%m") for s in starts]

    if not rows_ie and not rows_ext:
        fig = go.Figure()
        fig.add_trace(go.Bar(name="Ingresos", x=month_labels, y=[0] * months))
        fig.add_trace(go.Bar(name="Egresos", x=month_labels, y=[0] * months))
        fig.update_layout(barmode="group", title="Ingresos vs Egresos")
        return fig.to_dict()

    income_by_month: dict[str, float] = {lbl: 0.0 for lbl in month_labels}
    expense_by_month: dict[str, float] = {lbl: 0.0 for lbl in month_labels}

    for tx_date, tx_type, tx_amount, acc_currency in rows_ie:
        lbl = tx_date.strftime("%Y-%m")
        if lbl not in income_by_month:
            continue
        acc_cur = acc_currency.value if hasattr(acc_currency, 'value') else str(acc_currency)
        rate = exchange_rate_service.get_rate_for_month(
            db, user.id, acc_cur, target_currency, tx_date.year, tx_date.month
        ) or Decimal("1")
        converted = float(Decimal(str(tx_amount)) * rate)
        if tx_type == TransactionType.INCOME:
            income_by_month[lbl] += converted
        else:
            expense_by_month[lbl] += converted

    for tx_date, tx_amount, acc_currency in rows_ext:
        lbl = tx_date.strftime("%Y-%m")
        if lbl in expense_by_month:
            acc_cur = acc_currency.value if hasattr(acc_currency, 'value') else str(acc_currency)
            rate = exchange_rate_service.get_rate_for_month(
                db, user.id, acc_cur, target_currency, tx_date.year, tx_date.month
            ) or Decimal("1")
            expense_by_month[lbl] += float(Decimal(str(tx_amount)) * rate)

    income_vals = [income_by_month[lbl] for lbl in month_labels]
    expense_vals = [expense_by_month[lbl] for lbl in month_labels]

    fig = go.Figure()
    fig.add_trace(go.Bar(name="Ingresos", x=month_labels, y=income_vals, marker_color="#22c55e"))
    fig.add_trace(go.Bar(name="Egresos", x=month_labels, y=expense_vals, marker_color="#ef4444"))
    fig.update_layout(
        barmode="group",
        title=f"Ingresos vs Egresos (últimos {months} meses)",
        xaxis_title="Mes",
        yaxis_title="Monto",
    )
    return fig.to_dict()


# ---------------------------------------------------------------------------
# Chart 3: Top conceptos por gasto (barras horizontales)
# ---------------------------------------------------------------------------

def top_concepts(
    db: Session,
    user: User,
    date_from: date,
    date_to: date,
    limit: int = 10,
) -> dict:
    rows = (
        db.query(Concept.name, Category.name, Transaction.amount)
        .join(Transaction, Transaction.concept_id == Concept.id)
        .join(Category, Transaction.category_id == Category.id)
        .filter(
            Transaction.user_id == user.id,
            Transaction.is_deleted == False,
            Transaction.type == TransactionType.EXPENSE,
            Transaction.date >= date_from,
            Transaction.date <= date_to,
            or_(
                Transaction.transfer_role.is_(None),
                Transaction.transfer_role == TransferRole.SOURCE,
            ),
        )
        .all()
    )

    if not rows:
        return go.Figure().to_dict()

    df = pd.DataFrame(rows, columns=["concept", "category", "amount"])
    df["amount"] = df["amount"].astype(float)
    df["label"] = df["concept"] + " (" + df["category"] + ")"

    grouped = (
        df.groupby("label")["amount"]
        .sum()
        .reset_index()
        .sort_values("amount", ascending=True)
        .tail(limit)
    )

    fig = go.Figure(
        go.Bar(
            x=grouped["amount"],
            y=grouped["label"],
            orientation="h",
            marker_color="#6366f1",
        )
    )
    fig.update_layout(
        title=f"Top {limit} conceptos por gasto ({date_from} — {date_to})",
        xaxis_title="Monto",
        yaxis_title="",
        margin={"l": 200},
    )
    return fig.to_dict()


# ---------------------------------------------------------------------------
# Chart 4: Flujo neto diario (línea)
# ---------------------------------------------------------------------------

def daily_net_flow(
    db: Session,
    user: User,
    date_from: date,
    date_to: date,
) -> dict:
    rows = (
        db.query(Transaction.date, Transaction.type, Transaction.amount)
        .filter(
            Transaction.user_id == user.id,
            Transaction.is_deleted == False,
            Transaction.type.in_([TransactionType.INCOME, TransactionType.EXPENSE]),
            Transaction.date >= date_from,
            Transaction.date <= date_to,
            or_(
                Transaction.transfer_role.is_(None),
                Transaction.transfer_role == TransferRole.SOURCE,
            ),
        )
        .all()
    )

    # Full date range so days without transactions appear as 0
    all_days = pd.date_range(date_from, date_to, freq="D")

    if not rows:
        fig = go.Figure(go.Scatter(x=all_days, y=[0] * len(all_days), mode="lines"))
        fig.update_layout(title="Flujo neto diario")
        return fig.to_dict()

    df = pd.DataFrame(rows, columns=["date", "type", "amount"])
    df["amount"] = df["amount"].astype(float)
    df["signed"] = df.apply(
        lambda r: r["amount"] if r["type"] == TransactionType.INCOME else -r["amount"],
        axis=1,
    )
    df["date"] = pd.to_datetime(df["date"])

    daily = (
        df.groupby("date")["signed"]
        .sum()
        .reindex(all_days, fill_value=0)
        .reset_index()
    )
    daily.columns = ["date", "net"]
    daily["cumulative"] = daily["net"].cumsum()

    fig = go.Figure()
    fig.add_trace(
        go.Scatter(
            x=daily["date"],
            y=daily["cumulative"],
            mode="lines+markers",
            name="Flujo acumulado",
            line={"color": "#3b82f6", "width": 2},
            fill="tozeroy",
            fillcolor="rgba(59,130,246,0.1)",
        )
    )
    fig.add_trace(
        go.Bar(
            x=daily["date"],
            y=daily["net"],
            name="Neto diario",
            marker_color=daily["net"].apply(
                lambda v: "#22c55e" if v >= 0 else "#ef4444"
            ).tolist(),
            opacity=0.6,
        )
    )
    fig.update_layout(
        title=f"Flujo neto diario ({date_from} — {date_to})",
        xaxis_title="Fecha",
        yaxis_title="Monto",
        hovermode="x unified",
    )
    return fig.to_dict()


# ---------------------------------------------------------------------------
# Deep Dive: breakdown mensual para el 3er dashboard
# ---------------------------------------------------------------------------

def monthly_breakdown(db: Session, user: User, year: int, month: int, display_currency: str | None = None) -> MonthlyBreakdown:
    target_currency = display_currency or str(user.currency_default)
    date_from = date(year, month, 1)
    date_to = date(year, month, monthrange(year, month)[1])

    DestTx = aliased(Transaction)
    DestAccount = aliased(Account)

    rows = (
        db.query(Transaction, Category.name, Concept.name, Account.name, Account.currency, DestAccount.name, ExternalAccount.name)
        .join(Category, Transaction.category_id == Category.id)
        .join(Concept, Transaction.concept_id == Concept.id)
        .join(Account, Transaction.account_id == Account.id)
        .outerjoin(DestTx, Transaction.transfer_id == DestTx.id)
        .outerjoin(DestAccount, DestTx.account_id == DestAccount.id)
        .outerjoin(ExternalAccount, Transaction.external_account_id == ExternalAccount.id)
        .filter(
            Transaction.user_id == user.id,
            Transaction.is_deleted == False,
            Transaction.date >= date_from,
            Transaction.date <= date_to,
            or_(
                Transaction.transfer_role.is_(None),
                Transaction.transfer_role == TransferRole.SOURCE,
            ),
        )
        .order_by(Transaction.date.desc())
        .all()
    )

    def _convert(tx_amount, acc_currency, tx_date) -> float:
        acc_cur = acc_currency.value if hasattr(acc_currency, 'value') else str(acc_currency)
        rate = exchange_rate_service.get_rate_for_month(
            db, user.id, acc_cur, target_currency, tx_date.year, tx_date.month
        ) or Decimal("1")
        return float(Decimal(str(tx_amount)) * rate)

    income = sum(
        _convert(tx.amount, acc_currency, tx.date)
        for tx, _, _, _, acc_currency, _, _ in rows
        if tx.type == TransactionType.INCOME
    )
    expenses = sum(
        _convert(tx.amount, acc_currency, tx.date)
        for tx, _, _, _, acc_currency, _, _ in rows
        if tx.type == TransactionType.EXPENSE
    )

    cat_totals: dict[str, float] = {}
    income_cat_totals: dict[str, float] = {}
    daily_totals: dict[str, float] = {}
    for tx, cat_name, con_name, acc_name, acc_currency, dest_acc_name, ext_acc_name in rows:
        converted = _convert(tx.amount, acc_currency, tx.date)
        if tx.type == TransactionType.EXPENSE:
            cat_totals[cat_name] = cat_totals.get(cat_name, 0.0) + converted
            key = tx.date.isoformat()
            daily_totals[key] = daily_totals.get(key, 0.0) + converted
        elif tx.type == TransactionType.INCOME:
            income_cat_totals[cat_name] = income_cat_totals.get(cat_name, 0.0) + converted

    categories = [
        CategoryStat(name=k, total=v)
        for k, v in sorted(cat_totals.items(), key=lambda x: -x[1])
    ]
    income_categories = [
        CategoryStat(name=k, total=v)
        for k, v in sorted(income_cat_totals.items(), key=lambda x: -x[1])
    ]
    daily_expenses = [
        DailyExpense(date=k, total=v)
        for k, v in sorted(daily_totals.items())
    ]
    transactions = [
        MonthlyTx(
            id=str(tx.id),
            date=tx.date.isoformat(),
            type=tx.type.value,
            amount=_convert(tx.amount, acc_currency, tx.date),
            category_name=cat_name,
            concept_name=con_name,
            account_name=acc_name,
            description=tx.description,
            transfer_dest_name=dest_acc_name or ext_acc_name,
            metodo_pago=tx.metodo_pago.value if tx.type.value == "expense" else None,
            instalment_plan_id=str(tx.instalment_plan_id) if tx.instalment_plan_id else None,
        )
        for tx, cat_name, con_name, acc_name, acc_currency, dest_acc_name, ext_acc_name in rows
    ]

    return MonthlyBreakdown(
        income=income,
        expenses=expenses,
        savings=income - expenses,
        categories=categories,
        income_categories=income_categories,
        daily_expenses=daily_expenses,
        transactions=transactions,
    )


# ---------------------------------------------------------------------------
# Patrimonio acumulado — Dashboard 1
# ---------------------------------------------------------------------------

def patrimonio(
    db: Session,
    user: User,
    months: int = 24,
    months_ahead: int = 6,
    display_currency: str | None = None,
) -> list[MonthlyPatrimonio]:
    """
    Returns the cumulative net worth per month.

    Algorithm:
      1. Compute current net worth in display_currency using current month's rates.
      2. Fetch monthly net flow (income - expense - transfers_out) per month.
      3. Walk backwards: patrimonio[m-1] = patrimonio[m] - net_flow[m]
      4. If any month lacks exchange rates → that month and all prior = None.

    display_currency: if None, uses user.currency_default.
    """
    target_currency = display_currency or str(user.currency_default)
    today = date.today()

    # If the user entered transactions with future dates (e.g. budgeting ahead),
    # use the latest transaction month as the effective anchor so those months
    # are treated as "present/past" instead of being set to None.
    latest_tx_date = (
        db.query(func.max(Transaction.date))
        .filter(Transaction.user_id == user.id, Transaction.is_deleted == False)
        .scalar()
    )
    effective_today = latest_tx_date if (latest_tx_date and latest_tx_date > today) else today

    starts = _month_starts_range(months, months_ahead)

    accounts = account_crud.get_all_by_user(db, user.id)

    # --- Step 1: current net worth in target_currency ---
    current_net_worth = Decimal("0")
    for acc in accounts:
        acc_currency = acc.currency.value
        balance = Decimal(str(acc.balance))
        if acc_currency == target_currency:
            current_net_worth += balance
        else:
            rate = exchange_rate_service.get_rate_for_month(
                db, user.id, acc_currency, target_currency, today.year, today.month
            )
            if rate is not None:
                current_net_worth += balance * rate
            # If rate missing, skip account (partial net worth — flagged later)

    # --- Step 2: monthly net flow per month ---
    # net_flow[month_label] = income - expense - transfer_to_external
    # All amounts converted to target_currency using that month's rate.
    month_labels = [s.strftime("%Y-%m") for s in starts]

    # Fetch all relevant transactions in the range
    if starts:
        date_from = starts[0]
        last_start = starts[-1]
        date_to = last_start.replace(day=monthrange(last_start.year, last_start.month)[1])

        rows = (
            db.query(
                Transaction.date,
                Transaction.type,
                Transaction.amount,
                Transaction.transfer_role,
                Transaction.external_account_id,
                Account.currency,
            )
            .join(Account, Transaction.account_id == Account.id)
            .filter(
                Transaction.user_id == user.id,
                Transaction.is_deleted == False,
                Transaction.date >= date_from,
                Transaction.date <= date_to,
                or_(
                    Transaction.transfer_role.is_(None),
                    Transaction.transfer_role == TransferRole.SOURCE,
                ),
            )
            .all()
        )
    else:
        rows = []

    # Build per-month net flow
    net_flow: dict[str, Decimal] = {lbl: Decimal("0") for lbl in month_labels}
    missing_currencies_per_month: dict[str, set[str]] = {lbl: set() for lbl in month_labels}

    for tx_date, tx_type, tx_amount, tx_role, ext_acc_id, acc_currency in rows:
        month_label = tx_date.strftime("%Y-%m")
        if month_label not in net_flow:
            continue

        year, month = int(month_label[:4]), int(month_label[5:])
        amount = Decimal(str(tx_amount))
        acc_currency_str = acc_currency.value if hasattr(acc_currency, 'value') else str(acc_currency)

        # Convert to target currency
        if acc_currency_str == target_currency:
            converted = amount
        else:
            rate = exchange_rate_service.get_rate_for_month(
                db, user.id, acc_currency_str, target_currency, year, month
            )
            if rate is None:
                missing_currencies_per_month[month_label].add(f"{acc_currency_str}→{target_currency}")
                converted = None
            else:
                converted = amount * rate

        if converted is None:
            continue

        if tx_type == TransactionType.INCOME:
            net_flow[month_label] += converted
        elif tx_type == TransactionType.EXPENSE:
            net_flow[month_label] -= converted
        elif tx_type == TransactionType.TRANSFER and ext_acc_id is not None:
            # Transfer to external account = real outflow
            net_flow[month_label] -= converted
        # Internal transfers (no ext_acc_id) are skipped — net zero effect

    # --- Step 3: walk backwards from current net worth ---
    # Use effective_today as anchor: if the user entered future-dated transactions,
    # their account balances already reflect those, so we anchor at the latest tx month.
    current_label = effective_today.strftime("%Y-%m")
    if current_label not in month_labels:
        current_label = today.strftime("%Y-%m")
    try:
        current_idx = month_labels.index(current_label)
    except ValueError:
        current_idx = len(month_labels) - 1

    result_values: dict[str, float | None] = {}
    result_missing: dict[str, list[str]] = {}

    # Assign current net worth to current month
    result_values[current_label] = float(current_net_worth)
    result_missing[current_label] = list(missing_currencies_per_month.get(current_label, set()))

    # Walk backwards (past months)
    for i in range(current_idx - 1, -1, -1):
        lbl = month_labels[i]
        next_lbl = month_labels[i + 1]
        missing = missing_currencies_per_month.get(lbl, set())
        if missing or result_values.get(next_lbl) is None:
            result_values[lbl] = None
            result_missing[lbl] = list(missing)
        else:
            # patrimonio[m] = patrimonio[m+1] - net_flow[m+1]
            result_values[lbl] = result_values[next_lbl] - float(net_flow[month_labels[i + 1]])
            result_missing[lbl] = []

    # Walk forwards (future months)
    for i in range(current_idx + 1, len(month_labels)):
        lbl = month_labels[i]
        # Future months: no data yet, carry forward current net worth
        result_values[lbl] = None
        result_missing[lbl] = []

    return [
        MonthlyPatrimonio(
            month=lbl,
            value=result_values.get(lbl),
            missing_rate=bool(result_missing.get(lbl)),
            missing_currencies=result_missing.get(lbl, []),
        )
        for lbl in month_labels
    ]
