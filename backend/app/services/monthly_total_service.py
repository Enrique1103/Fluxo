import uuid
from datetime import date
from decimal import Decimal
from sqlalchemy.orm import Session

from app.crud import monthly_total_crud
from app.exceptions.monthly_total_exceptions import MonthlyTotalNotFound, MonthlyTotalFutureMonth, MonthlyTotalFileError
from app.models.monthly_total_models import MonthlyTotal
from app.models.users_models import User
from app.schemas.monthly_total_schema import MonthlyTotalBulk, MonthlyTotalBulkResult


def get_all(db: Session, user: User) -> list[MonthlyTotal]:
    return monthly_total_crud.get_all_by_user(db, user.id)


def upsert_many(db: Session, user: User, payload: MonthlyTotalBulk) -> MonthlyTotalBulkResult:
    today = date.today()
    for row in payload.rows:
        if (row.year, row.month) > (today.year, today.month):
            raise MonthlyTotalFutureMonth(
                f"No se pueden cargar totales de meses futuros ({row.year}-{row.month:02d})"
            )
    created = updated = 0
    try:
        for row in payload.rows:
            existing = monthly_total_crud.get_one(db, user.id, row.year, row.month, row.currency)
            if existing:
                monthly_total_crud.update_amounts(db, existing, row.income, row.expense)
                updated += 1
            else:
                monthly_total_crud.create(db, user.id, row.year, row.month, row.currency, row.income, row.expense)
                created += 1
        db.commit()
    except Exception:
        db.rollback()
        raise
    return MonthlyTotalBulkResult(created=created, updated=updated)


def parse_upload(user: User, content: bytes, filename: str, currency: str | None) -> dict:
    """Lee la plantilla completada (.xlsx/.csv) y devuelve las filas para previsualizar."""
    from app.services.monthly_total_parser import parse_file
    if len(content) > 2 * 1024 * 1024:
        raise MonthlyTotalFileError("El archivo es demasiado grande (máximo 2 MB)")
    return parse_file(content, filename, (currency or str(user.currency_default)).upper())


def delete(db: Session, user: User, total_id: uuid.UUID) -> None:
    mt = monthly_total_crud.get_by_id(db, total_id)
    if not mt or mt.user_id != user.id:
        raise MonthlyTotalNotFound("Total mensual no encontrado")
    try:
        monthly_total_crud.delete(db, mt)
        db.commit()
    except Exception:
        db.rollback()
        raise


def totals_by_month(
    db: Session, user_id: uuid.UUID, date_from: date, date_to: date
) -> list[tuple[str, str, Decimal, Decimal]]:
    """[(\"YYYY-MM\", currency, income, expense)] de los totales importados en el rango (para analytics)."""
    rows = monthly_total_crud.get_in_range(
        db, user_id, date_from.year, date_from.month, date_to.year, date_to.month
    )
    return [
        (f"{r.year}-{r.month:02d}", r.currency, Decimal(str(r.income)), Decimal(str(r.expense)))
        for r in rows
    ]
