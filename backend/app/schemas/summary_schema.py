import uuid
from decimal import Decimal
from pydantic import BaseModel

from app.schemas.account_schema import AccountType, CurrencyCode


class AccountSummary(BaseModel):
    id: uuid.UUID
    name: str
    type: AccountType
    currency: CurrencyCode
    balance: Decimal
    credit_limit: Decimal | None

    model_config = {"from_attributes": True}


class CategoryBreakdown(BaseModel):
    category_name: str
    total: Decimal


class SummaryResponse(BaseModel):
    net_worth: Decimal
    total_assets: Decimal
    total_debt: Decimal
    income_this_month: Decimal
    expense_this_month: Decimal
    net_this_month: Decimal
    accounts: list[AccountSummary]
    expense_by_category: list[CategoryBreakdown]
    first_tx_month: str | None = None  # "YYYY-MM" of earliest transaction
