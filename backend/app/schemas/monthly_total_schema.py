import uuid
from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field, field_validator


class MonthlyTotalIn(BaseModel):
    year: int = Field(..., ge=1990, le=2100)
    month: int = Field(..., ge=1, le=12)
    currency: str = Field(..., pattern=r"^[A-Z]{2,10}$")
    income: Decimal = Field(default=Decimal("0.00"), ge=0)
    expense: Decimal = Field(default=Decimal("0.00"), ge=0)

    @field_validator("currency", mode="before")
    @classmethod
    def upper(cls, v):
        return v.upper() if isinstance(v, str) else v


class MonthlyTotalBulk(BaseModel):
    # Si ya existe un total para ese mes y moneda, se reemplaza.
    rows: list[MonthlyTotalIn] = Field(..., min_length=1, max_length=600)


class MonthlyTotalResponse(BaseModel):
    id: uuid.UUID
    year: int
    month: int
    currency: str
    income: Decimal
    expense: Decimal
    created_at: datetime

    model_config = {"from_attributes": True}


class MonthlyTotalBulkResult(BaseModel):
    created: int
    updated: int
