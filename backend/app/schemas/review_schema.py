import uuid
from datetime import datetime
from pydantic import BaseModel, Field
from app.models.review_models import ReviewType, ReviewStatus


class ReviewCreate(BaseModel):
    transaction_id: uuid.UUID
    household_id: uuid.UUID
    flag_type: ReviewType
    comment: str | None = Field(None, max_length=500)


class ReviewRespond(BaseModel):
    status: ReviewStatus
    response_comment: str | None = Field(None, max_length=500)


class ReviewResponse(BaseModel):
    id: uuid.UUID
    transaction_id: uuid.UUID
    household_id: uuid.UUID
    flagged_by_user_id: uuid.UUID
    flag_type: ReviewType
    comment: str | None
    status: ReviewStatus
    created_at: datetime
    response_comment: str | None
    response_at: datetime | None

    model_config = {"from_attributes": True}
