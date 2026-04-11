import uuid
from datetime import date as PyDate, datetime
from decimal import Decimal
from enum import Enum
from pydantic import BaseModel, Field, model_validator


class TransactionType(str, Enum):
    INCOME = "income"
    EXPENSE = "expense"
    TRANSFER = "transfer"


class TransferRole(str, Enum):
    SOURCE = "source"
    DESTINATION = "destination"


class PaymentMethod(str, Enum):
    EFECTIVO = "efectivo"
    TARJETA_CREDITO = "tarjeta_credito"
    TARJETA_DEBITO = "tarjeta_debito"
    TRANSFERENCIA_BANCARIA = "transferencia_bancaria"
    BILLETERA_DIGITAL = "billetera_digital"
    OTRO = "otro"


# --- Creación ---
# transfer_to_account_id es obligatorio solo cuando type = TRANSFER.
# metodo_pago solo aplica para EXPENSE; para otros tipos se ignora.
class TransactionCreate(BaseModel):
    account_id: uuid.UUID
    concept_id: uuid.UUID
    category_id: uuid.UUID
    amount: Decimal = Field(..., gt=0)
    type: TransactionType
    date: PyDate
    description: str | None = Field(default=None, max_length=100)
    transfer_to_account_id: uuid.UUID | None = None
    external_account_id: uuid.UUID | None = None
    # Método de pago — solo aplica para EXPENSE, ignorado para otros tipos
    metodo_pago: PaymentMethod = PaymentMethod.OTRO
    # Hogar compartido — solo aplica para EXPENSE, ignorado para otros tipos
    household_id: uuid.UUID | None = None

    @model_validator(mode="after")
    def validate_transfer_fields(self):
        if self.type == TransactionType.TRANSFER:
            has_internal = self.transfer_to_account_id is not None
            has_external = self.external_account_id is not None
            if not has_internal and not has_external:
                raise ValueError("Para una transferencia se requiere transfer_to_account_id o external_account_id")
            if has_internal and has_external:
                raise ValueError("Especificá transfer_to_account_id o external_account_id, no ambos")
        else:
            if self.transfer_to_account_id is not None:
                raise ValueError("transfer_to_account_id solo aplica para TRANSFER")
            if self.external_account_id is not None:
                raise ValueError("external_account_id solo aplica para TRANSFER")
        return self


# --- Actualización ---
# type y account_id NO son actualizables: cambiar el tipo requiere
# recalcular balances en dos cuentas, lo cual es una operación destructiva.
# Para ese caso el flujo correcto es eliminar y recrear la transacción.
class TransactionUpdate(BaseModel):
    amount: Decimal | None = Field(None, gt=0)
    description: str | None = Field(None, max_length=100)
    date: PyDate | None = None
    concept_id: uuid.UUID | None = None
    category_id: uuid.UUID | None = None
    metodo_pago: PaymentMethod | None = None
    household_id: uuid.UUID | None = None


# --- Respuesta al frontend ---
class TransactionResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    account_id: uuid.UUID
    category_id: uuid.UUID
    concept_id: uuid.UUID
    amount: Decimal
    type: TransactionType
    date: PyDate
    description: str | None
    transfer_id: uuid.UUID | None
    transfer_role: TransferRole | None
    external_account_id: uuid.UUID | None = None
    metodo_pago: PaymentMethod
    instalment_plan_id: uuid.UUID | None = None
    household_id: uuid.UUID | None = None
    created_at: datetime

    model_config = {"from_attributes": True}
