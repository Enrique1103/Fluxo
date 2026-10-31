import uuid
from decimal import Decimal
from pydantic import BaseModel, field_validator


class BudgetCreate(BaseModel):
    category_id: uuid.UUID
    # Categorías adicionales para presupuesto agrupado (ej: Alimentación + Hogar)
    extra_category_ids: list[uuid.UUID] = []
    # Opcional: sin concepto el presupuesto es de toda la categoría (suma todos sus conceptos)
    concept_id: uuid.UUID | None = None
    # Nombre personalizado (solo para presupuestos de varias categorías)
    name: str | None = None
    month: int
    year: int
    max_amount: Decimal
    currency: str

    @field_validator("month")
    @classmethod
    def validate_month(cls, v: int) -> int:
        if not 1 <= v <= 12:
            raise ValueError("month must be between 1 and 12")
        return v

    @field_validator("year")
    @classmethod
    def validate_year(cls, v: int) -> int:
        if v < 2000:
            raise ValueError("year must be >= 2000")
        return v

    @field_validator("max_amount")
    @classmethod
    def validate_amount(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("max_amount must be positive")
        return v

    @field_validator("currency")
    @classmethod
    def validate_currency(cls, v: str) -> str:
        allowed = {"UYU", "USD"}
        if v.upper() not in allowed:
            raise ValueError(f"currency must be one of {allowed}")
        return v.upper()


class BudgetUpdate(BaseModel):
    max_amount: Decimal

    @field_validator("max_amount")
    @classmethod
    def validate_amount(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("max_amount must be positive")
        return v


class BudgetBulkItem(BaseModel):
    category_id: uuid.UUID
    extra_category_ids: list[uuid.UUID] = []
    concept_id: uuid.UUID | None = None
    name: str | None = None
    max_amount: Decimal
    currency: str

    _amount = field_validator("max_amount")(BudgetUpdate.validate_amount.__func__)
    _currency = field_validator("currency")(BudgetCreate.validate_currency.__func__)


class BudgetBulkSave(BaseModel):
    """Guarda varios presupuestos de un mes de una vez (ej: copia editada del mes anterior).
    Si ya existe el mismo presupuesto en ese mes, se actualiza el monto."""
    month: int
    year: int
    items: list[BudgetBulkItem]

    _month = field_validator("month")(BudgetCreate.validate_month.__func__)
    _year = field_validator("year")(BudgetCreate.validate_year.__func__)


class BudgetResponse(BaseModel):
    class Config:
        from_attributes = True

    id: uuid.UUID
    user_id: uuid.UUID
    category_id: uuid.UUID
    category_name: str
    extra_category_ids: list[uuid.UUID] = []
    extra_category_names: list[str] = []
    concept_id: uuid.UUID | None = None
    concept_name: str | None = None
    name: str | None = None
    month: int
    year: int
    max_amount: Decimal
    currency: str
    spent: Decimal
