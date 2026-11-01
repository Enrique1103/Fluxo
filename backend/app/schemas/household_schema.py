import uuid
from datetime import date as PyDate, datetime
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator
from app.models.household_models import SplitType, MemberRole, MemberStatus, InviteStatus, AnalysisLevel


class ConceptBreakdown(BaseModel):
    concept_name: str
    total: Decimal
    currency: str
    transaction_count: int


class MemberIncome(BaseModel):
    user_id: uuid.UUID
    user_name: str
    amount: Decimal
    currency: str


class MemberTransaction(BaseModel):
    transaction_id: uuid.UUID
    date: str
    type: str                  # "income" | "expense"
    concept_name: str
    category_name: str
    amount: Decimal
    currency: str
    user_id: uuid.UUID
    user_name: str
    account_name: str
    description: str | None = None


# ---------------------------------------------------------------------------
# Household
# ---------------------------------------------------------------------------

class HouseholdCreate(BaseModel):
    name: str
    base_currency: str = "UYU"
    split_type: SplitType = SplitType.EQUAL
    analysis_level: AnalysisLevel = AnalysisLevel.EXPENSES_ONLY

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
    # split_type y analysis_level son inmutables — definen el contrato del hogar

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
    analysis_level: AnalysisLevel = AnalysisLevel.EXPENSES_ONLY  # default si la columna es NULL en filas viejas
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
    account_name: str
    description: str | None = None


class CategoryBreakdown(BaseModel):
    category_name: str
    total: Decimal
    currency: str


class SettlementPayment(BaseModel):
    """Pago registrado del balanceo del mes."""
    id: uuid.UUID
    from_user_id: uuid.UUID
    from_user_name: str
    to_user_id: uuid.UUID
    to_user_name: str
    amount: Decimal
    currency: str
    paid_date: str
    comment: str | None
    confirmed: bool          # el que cobra ya indicó a qué cuenta entró


class SettlementPayIn(BaseModel):
    """El que debe registra el pago: a quién, de qué cuenta, cuándo y un comentario."""
    year: int = Field(..., ge=2000, le=2100)
    month: int = Field(..., ge=1, le=12)
    to_user_id: uuid.UUID
    account_id: uuid.UUID
    date: PyDate
    comment: str | None = Field(default=None, max_length=100)


class SettlementConfirmIn(BaseModel):
    """El que cobra confirma a qué cuenta entró la plata."""
    account_id: uuid.UUID
    date: PyDate | None = None


class MemberTransferIn(BaseModel):
    """El emisor crea la transferencia eligiendo ambas cuentas."""
    to_user_id: uuid.UUID
    from_account_id: uuid.UUID
    to_account_id: uuid.UUID
    amount: Decimal = Field(..., gt=0)
    currency: str = Field(..., min_length=3, max_length=3)
    date: PyDate
    description: str | None = Field(default=None, max_length=200)


class MemberTransferUpdate(BaseModel):
    """Campos editables de una transferencia entre miembros."""
    amount: Decimal | None = Field(default=None, gt=0)
    currency: str | None = Field(default=None, min_length=3, max_length=3)
    date: PyDate | None = None
    description: str | None = Field(default=None, max_length=200)


class MemberTransferOut(BaseModel):
    id: uuid.UUID
    household_id: uuid.UUID
    from_user_id: uuid.UUID
    from_user_name: str
    to_user_id: uuid.UUID
    to_user_name: str
    amount: Decimal
    currency: str
    date: str
    description: str | None
    created_at: str


class PendingMemberTransferIn(BaseModel):
    """El emisor crea la transferencia pendiente (sin cuenta destino)."""
    to_user_id: uuid.UUID
    from_account_id: uuid.UUID
    amount: Decimal = Field(..., gt=0)
    currency: str = Field(..., min_length=3, max_length=3)
    date: PyDate
    description: str | None = Field(default=None, max_length=200)


class AcceptPendingTransferIn(BaseModel):
    """El receptor acepta eligiendo a qué cuenta entra el dinero."""
    to_account_id: uuid.UUID


class PendingMemberTransferOut(BaseModel):
    id: uuid.UUID
    household_id: uuid.UUID
    from_user_id: uuid.UUID
    from_user_name: str
    to_user_id: uuid.UUID
    to_user_name: str
    amount: Decimal
    currency: str
    date: str
    description: str | None
    created_at: str


class HouseholdAnalyticsResponse(BaseModel):
    household_id: uuid.UUID
    period: str                             # "YYYY-MM"
    split_type: SplitType
    members: list[MemberContribution]
    shared_expenses: list[SharedExpense]
    settlement: list[SettlementItem]
    settlement_payments: list[SettlementPayment] = []
    alerts: list[HouseholdAlert]
    expense_by_category: list[CategoryBreakdown]
    total_shared: Decimal
    base_currency: str
    # F01: campos para el dashboard mejorado
    daily_average: Decimal
    top_concepts: list[ConceptBreakdown]
    expenses_by_day: dict[int, Decimal]
    prev_month_total: Decimal
    prev_month_change_pct: Decimal | None
    # F03: nivel de análisis y datos condicionales
    analysis_level: AnalysisLevel
    member_incomes: list[MemberIncome] | None                  # Solo cuando analysis_level=FULL
    net_savings: Decimal | None                               # Solo cuando analysis_level=FULL
    total_group_income: Decimal | None                        # Solo cuando analysis_level=FULL
    member_transactions: list[MemberTransaction] | None = None  # Solo cuando analysis_level=FULL
    member_transfers: list[MemberTransferOut] = []              # Solo cuando analysis_level=FULL
