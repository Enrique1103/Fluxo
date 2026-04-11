import uuid
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.models.importacion import Importacion


def get_all_by_user(
    db: Session,
    user_id: uuid.UUID,
    skip: int = 0,
    limit: int = 10,
) -> list[Importacion]:
    return (
        db.query(Importacion)
        .filter(Importacion.user_id == user_id)
        .order_by(Importacion.fecha.desc())
        .offset(skip)
        .limit(limit)
        .all()
    )
