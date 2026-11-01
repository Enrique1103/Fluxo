import uuid
from decimal import Decimal
from enum import Enum
from pydantic import BaseModel, Field, model_validator

_CURRENCY_PATTERN = r"^[A-Z]{2,10}$"


class AccountType(str, Enum):
    CASH = "cash"
    DEBIT = "debit"
    CREDIT = "credit"
    INVESTMENT = "investment"


# --- Creación ---
class AccountCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    type: AccountType
    currency: str = Field(..., pattern=_CURRENCY_PATTERN)
    balance: Decimal = Field(default=Decimal("0.00"))
    credit_limit: Decimal | None = Field(None, gt=0)

    @model_validator(mode="after")
    def validate_credit_fields(self):
        if self.type == AccountType.CREDIT:
            if self.credit_limit is None:
                raise ValueError("credit_limit es obligatorio para cuentas de tipo CREDIT")
            if self.balance < 0:
                raise ValueError("El saldo inicial de una cuenta de crédito no puede ser negativo")
        elif self.type == AccountType.INVESTMENT:
            pass  # Inversión admite saldo negativo (posición apalancada / margen)
        else:
            # Efectivo y débito no pueden iniciar con saldo negativo
            if self.balance < 0:
                raise ValueError("El saldo inicial no puede ser negativo para este tipo de cuenta")
        if self.type != AccountType.CREDIT and self.credit_limit is not None:
            raise ValueError("credit_limit solo aplica para cuentas de tipo CREDIT")
        return self


# --- Actualización ---
class AccountUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=100)
    type: AccountType | None = None
    currency: str | None = Field(None, pattern=_CURRENCY_PATTERN)
    credit_limit: Decimal | None = Field(None, gt=0)
    balance: Decimal | None = None
    is_archived: bool | None = None


# --- Respuesta al frontend ---
class AccountResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    type: AccountType
    currency: str
    balance: Decimal
    credit_limit: Decimal | None
    is_liability: bool
    is_archived: bool = False
    has_transactions: bool = False

    model_config = {"from_attributes": True}
