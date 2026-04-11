import uuid
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, field_validator
from app.models.household_models import SplitType, MemberRole, MemberStatus, InviteStatus


# ---------------------------------------------------------------------------
# Household
# ---------------------------------------------------------------------------

class HouseholdCreate(BaseModel):
    name: str
    base_currency: str = "UYU"
    split_type: SplitType = SplitType.EQUAL

    @field_validator("base_currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        v = v.upper()
        if v not in ("UYU", "USD", "EUR"):
            raise ValueError("Moneda no soportada. Usá UYU, USD o EUR.")
        return v


class HouseholdUpdate(BaseModel):
    name: str | None = None
    base_currency: str | None = None
    split_type: SplitType | None = None

    @field_validator("base_currency")
    @classmethod
    def validate_currency(cls, v: str | None) -> str | None:
        if v is not None:
            v = v.upper()
            if v not in ("UYU", "USD", "EUR"):
                raise ValueError("Moneda no soportada. Usá UYU, USD o EUR.")
        return v


class HouseholdResponse(BaseModel):
    id: uuid.UUID
    name: str
    base_currency: str
    split_type: SplitType
    created_by: uuid.UUID
    created_at: datetime

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Members
# ---------------------------------------------------------------------------

class MemberResponse(BaseModel):
    id: uuid.UUID
    household_id: uuid.UUID
    user_id: uuid.UUID
    user_name: str
    role: MemberRole
    status: MemberStatus
    joined_at: datetime | None

    model_config = {"from_attributes": True}


# ---------------------------------------------------------------------------
# Invites
# ---------------------------------------------------------------------------

class InviteResponse(BaseModel):
    id: uuid.UUID
    household_id: uuid.UUID
    code: str
    expires_at: datetime
    status: InviteStatus

    model_config = {"from_attributes": True}


class JoinRequest(BaseModel):
    code: str


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------

class MemberContribution(BaseModel):
    user_id: uuid.UUID
    user_name: str
    income_pct: Decimal          # % de ingresos sobre total del grupo (0-100)
    expenses_paid: Decimal       # total que pagó en gastos compartidos
    should_pay: Decimal          # cuánto le corresponde pagar según split
    balance: Decimal             # expenses_paid - should_pay (+ = le deben, - = debe)


class SettlementItem(BaseModel):
    from_user_id: uuid.UUID
    from_user_name: str
    to_user_id: uuid.UUID
    to_user_name: str
    amount: Decimal
    currency: str


class HouseholdAlert(BaseModel):
    type: str        # "missing_rate" | "no_income" | "pending_member"
    message: str
    user_id: uuid.UUID | None = None
    currency: str | None = None


class SharedExpense(BaseModel):
    transaction_id: uuid.UUID
    date: str
    concept_name: str
    category_name: str
    amount: Decimal
    currency: str
    paid_by_user_id: uuid.UUID
    paid_by_user_name: str


class CategoryBreakdown(BaseModel):
    category_name: str
    total: Decimal
    currency: str


class HouseholdAnalyticsResponse(BaseModel):
    household_id: uuid.UUID
    period: str                             # "YYYY-MM"
    split_type: SplitType
    members: list[MemberContribution]
    shared_expenses: list[SharedExpense]
    settlement: list[SettlementItem]
    alerts: list[HouseholdAlert]
    expense_by_category: list[CategoryBreakdown]
    total_shared: Decimal
    base_currency: str
