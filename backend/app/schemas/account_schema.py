import uuid
from decimal import Decimal
from enum import Enum
from pydantic import BaseModel, Field, model_validator


class AccountType(str, Enum):
    CASH = "cash"
    DEBIT = "debit"
    CREDIT = "credit"
    INVESTMENT = "investment"


class CurrencyCode(str, Enum):
    UYU = "UYU"
    USD = "USD"
    EUR = "EUR"


# --- Creación ---
class AccountCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    type: AccountType
    currency: CurrencyCode
    balance: Decimal = Field(default=Decimal("0.00"), ge=0)
    credit_limit: Decimal | None = Field(None, gt=0)

    @model_validator(mode="after")
    def validate_credit_fields(self):
        if self.type == AccountType.CREDIT:
            if self.credit_limit is None:
                raise ValueError("credit_limit es obligatorio para cuentas de tipo CREDIT")
            # Las cuentas de crédito siempre inician con balance 0 — ignorar lo que venga
            self.balance = Decimal("0.00")
        if self.type != AccountType.CREDIT and self.credit_limit is not None:
            raise ValueError("credit_limit solo aplica para cuentas de tipo CREDIT")
        return self


# --- Actualización ---
class AccountUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=100)
    type: AccountType | None = None
    currency: CurrencyCode | None = None
    credit_limit: Decimal | None = Field(None, gt=0)


# --- Respuesta al frontend ---
class AccountResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    type: AccountType
    currency: CurrencyCode
    balance: Decimal
    credit_limit: Decimal | None
    is_liability: bool
    has_transactions: bool = False

    model_config = {"from_attributes": True}
