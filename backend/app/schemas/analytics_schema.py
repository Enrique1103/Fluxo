from typing import Any
from pydantic import BaseModel


class PlotlyFigure(BaseModel):
    data: list[Any]
    layout: dict[str, Any]


class CategoryStat(BaseModel):
    name: str
    total: float


class DailyExpense(BaseModel):
    date: str
    total: float


class MonthlyTx(BaseModel):
    id: str
    date: str
    type: str
    amount: float
    category_name: str
    concept_name: str
    account_name: str
    description: str | None
    transfer_dest_name: str | None = None
    metodo_pago: str | None = None
    instalment_plan_id: str | None = None


class MonthlyBreakdown(BaseModel):
    income: float
    expenses: float
    savings: float
    categories: list[CategoryStat]
    income_categories: list[CategoryStat]
    daily_expenses: list[DailyExpense]
    transactions: list[MonthlyTx]


class MonthlyPatrimonio(BaseModel):
    month: str               # "2025-03"
    value: float | None      # None si falta la tasa de cambio
    missing_rate: bool
    missing_currencies: list[str]  # qué pares faltan, e.g. ["USD→UYU"]
