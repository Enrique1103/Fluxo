import uuid
from decimal import Decimal
from pydantic import BaseModel, field_validator


class BudgetCreate(BaseModel):
    category_id: uuid.UUID
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


class BudgetResponse(BaseModel):
    class Config:
        from_attributes = True

    id: uuid.UUID
    user_id: uuid.UUID
    category_id: uuid.UUID
    category_name: str
    month: int
    year: int
    max_amount: Decimal
    currency: str
    spent: Decimal
