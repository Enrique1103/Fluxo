from pydantic import BaseModel, field_validator
from decimal import Decimal


class ExchangeRateCreate(BaseModel):
    from_currency: str
    to_currency: str
    rate: Decimal
    year: int
    month: int

    @field_validator("rate")
    @classmethod
    def rate_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("La tasa debe ser mayor a 0")
        return v

    @field_validator("month")
    @classmethod
    def month_valid(cls, v: int) -> int:
        if not 1 <= v <= 12:
            raise ValueError("El mes debe estar entre 1 y 12")
        return v

    @field_validator("year")
    @classmethod
    def year_valid(cls, v: int) -> int:
        if not 2000 <= v <= 2100:
            raise ValueError("Año inválido")
        return v


class ExchangeRateUpdate(BaseModel):
    rate: Decimal

    @field_validator("rate")
    @classmethod
    def rate_positive(cls, v: Decimal) -> Decimal:
        if v <= 0:
            raise ValueError("La tasa debe ser mayor a 0")
        return v


class ExchangeRateResponse(BaseModel):
    id: str
    from_currency: str
    to_currency: str
    rate: float
    year: int
    month: int

    model_config = {"from_attributes": True}

    @classmethod
    def from_orm_model(cls, obj) -> "ExchangeRateResponse":
        return cls(
            id=str(obj.id),
            from_currency=obj.from_currency,
            to_currency=obj.to_currency,
            rate=float(obj.rate),
            year=obj.year,
            month=obj.month,
        )


class ExchangeRateCheck(BaseModel):
    has_all_rates: bool
    missing_pairs: list[str]   # e.g. ["USD→UYU"]
    current_year: int
    current_month: int
