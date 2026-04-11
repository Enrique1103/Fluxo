import uuid
from datetime import date as PyDate, datetime
from decimal import Decimal
from enum import Enum
from pydantic import BaseModel, Field


class PaymentMethod(str, Enum):
    EFECTIVO = "efectivo"
    TARJETA_CREDITO = "tarjeta_credito"
    TARJETA_DEBITO = "tarjeta_debito"
    TRANSFERENCIA_BANCARIA = "transferencia_bancaria"
    BILLETERA_DIGITAL = "billetera_digital"
    OTRO = "otro"


class InstalmentPlanCreate(BaseModel):
    account_id: uuid.UUID
    concept_id: uuid.UUID
    category_id: uuid.UUID
    description: str | None = Field(default=None, max_length=100)
    total_amount: Decimal = Field(..., gt=0)
    n_cuotas: int = Field(..., ge=2, le=60)
    fecha_inicio: PyDate
    metodo_pago: PaymentMethod = PaymentMethod.TARJETA_CREDITO


class InstalmentPlanUpdate(BaseModel):
    description: str | None = Field(default=None, max_length=100)


class InstalmentPlanResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    account_id: uuid.UUID
    category_id: uuid.UUID
    concept_id: uuid.UUID
    description: str | None
    total_amount: Decimal
    monto_cuota: Decimal
    n_cuotas: int
    cuotas_pagadas: int
    cuotas_restantes: int
    fecha_inicio: PyDate
    metodo_pago: PaymentMethod
    is_active: bool
    created_at: datetime
