from datetime import date, timedelta
from typing import Annotated
import uuid

from fastapi import APIRouter, Depends, Query
from sqlalchemy.orm import Session

from app.api.dependeces import get_current_user, get_db
from app.models.users_models import User
from app.schemas.analytics_schema import PlotlyFigure, MonthlyBreakdown, MonthlyPatrimonio
from app.services import analytics_service

router = APIRouter(prefix="/analytics", tags=["analytics"])


def _default_date_from() -> date:
    return date.today().replace(day=1)


def _default_date_to() -> date:
    return date.today()


@router.get("/expenses-by-category", response_model=PlotlyFigure)
def get_expenses_by_category(
    date_from: Annotated[date, Query()] = None,
    date_to: Annotated[date, Query()] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    df = date_from or _default_date_from()
    dt = date_to or _default_date_to()
    fig = analytics_service.expenses_by_category(db, current_user, df, dt)
    return PlotlyFigure(**fig)


@router.get("/income-vs-expenses", response_model=PlotlyFigure)
def get_income_vs_expenses(
    months: Annotated[int, Query(ge=1, le=600)] = 6,
    months_ahead: Annotated[int, Query(ge=0, le=600)] = 0,
    currency: Annotated[str | None, Query(max_length=3)] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    fig = analytics_service.income_vs_expenses(db, current_user, months, months_ahead, currency)
    return PlotlyFigure(**fig)


@router.get("/top-concepts", response_model=PlotlyFigure)
def get_top_concepts(
    date_from: Annotated[date, Query()] = None,
    date_to: Annotated[date, Query()] = None,
    limit: Annotated[int, Query(ge=1, le=20)] = 10,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    df = date_from or _default_date_from()
    dt = date_to or _default_date_to()
    fig = analytics_service.top_concepts(db, current_user, df, dt, limit)
    return PlotlyFigure(**fig)


@router.get("/daily-net-flow", response_model=PlotlyFigure)
def get_daily_net_flow(
    date_from: Annotated[date, Query()] = None,
    date_to: Annotated[date, Query()] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    df = date_from or _default_date_from()
    dt = date_to or _default_date_to()
    fig = analytics_service.daily_net_flow(db, current_user, df, dt)
    return PlotlyFigure(**fig)


@router.get("/monthly-breakdown", response_model=MonthlyBreakdown)
def get_monthly_breakdown(
    year: Annotated[int, Query(ge=2000, le=2100)],
    month: Annotated[int, Query(ge=1, le=12)],
    currency: Annotated[str | None, Query(max_length=3)] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return analytics_service.monthly_breakdown(db, current_user, year, month, currency)


@router.get("/patrimonio", response_model=list[MonthlyPatrimonio])
def get_patrimonio(
    months: Annotated[int, Query(ge=1, le=600)] = 24,
    months_ahead: Annotated[int, Query(ge=0, le=600)] = 6,
    currency: Annotated[str | None, Query(max_length=3)] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return analytics_service.patrimonio(db, current_user, months, months_ahead, currency)
