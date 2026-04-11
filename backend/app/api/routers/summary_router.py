from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from app.api.dependeces import get_current_user
from app.core.database import get_db
from app.models.users_models import User
from app.schemas.summary_schema import SummaryResponse
from app.services import summary_service

router = APIRouter(prefix="/summary", tags=["Summary"])


@router.get("", response_model=SummaryResponse)
def get_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return summary_service.get_summary(db, current_user)
