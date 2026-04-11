from datetime import date, timedelta
from decimal import Decimal
from sqlalchemy import func, or_
from sqlalchemy.orm import Session

from app.crud import account_crud
from app.models.accounts_models import Account, AccountType
from app.models.transactions_models import Transaction, TransactionType, TransferRole
from app.models.users_models import User
from app.schemas.summary_schema import SummaryResponse, AccountSummary, CategoryBreakdown


def get_summary(db: Session, user: User) -> SummaryResponse:
    accounts = account_crud.get_all_by_user(db, user.id)

    # --- Net worth ---
    total_assets = sum(
        (a.balance for a in accounts if a.type != AccountType.CREDIT),
        Decimal("0.00"),
    )
    total_debt = sum(
        (a.balance for a in accounts if a.type == AccountType.CREDIT),
        Decimal("0.00"),
    )
    net_worth = total_assets + total_debt  # debt is negative, so addition is correct

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
    ]

    # --- Current month range (full month, including future-dated transactions) ---
    from calendar import monthrange as _monthrange
    today = date.today()
    month_start = today.replace(day=1)
    month_end = today.replace(day=_monthrange(today.year, today.month)[1])

    base_q = (
        db.query(Transaction)
        .filter(
            Transaction.user_id == user.id,
            Transaction.is_deleted == False,
            or_(Transaction.transfer_role.is_(None), Transaction.transfer_role == TransferRole.SOURCE),
            Transaction.date >= month_start,
            Transaction.date <= month_end,
        )
    )

    income_this_month: Decimal = (
        base_q.filter(Transaction.type == TransactionType.INCOME)
        .with_entities(func.coalesce(func.sum(Transaction.amount), Decimal("0.00")))
        .scalar()
    )
    expense_this_month: Decimal = (
        base_q.filter(Transaction.type == TransactionType.EXPENSE)
        .with_entities(func.coalesce(func.sum(Transaction.amount), Decimal("0.00")))
        .scalar()
    )

    income_this_month = Decimal(str(income_this_month))
    expense_this_month = Decimal(str(expense_this_month))

    # --- Expense breakdown by category (current month) ---
    from app.models.categories_models import Category

    rows = (
        db.query(Category.name, func.sum(Transaction.amount))
        .join(Transaction, Transaction.category_id == Category.id)
        .filter(
            Transaction.user_id == user.id,
            Transaction.is_deleted == False,
            Transaction.type == TransactionType.EXPENSE,
            Transaction.date >= month_start,
            Transaction.date <= today,
        )
        .group_by(Category.name)
        .order_by(func.sum(Transaction.amount).desc())
        .all()
    )
    expense_by_category = [
        CategoryBreakdown(category_name=name, total=Decimal(str(total)))
        for name, total in rows
    ]

    first_tx = (
        db.query(func.min(Transaction.date))
        .filter(
            Transaction.user_id == user.id,
            Transaction.is_deleted == False,
        )
        .scalar()
    )
    first_tx_month = first_tx.strftime("%Y-%m") if first_tx else None

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
