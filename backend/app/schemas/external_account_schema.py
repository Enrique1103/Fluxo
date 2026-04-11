import uuid
from datetime import datetime
from pydantic import BaseModel, Field


class ExternalAccountCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    account_number: str | None = Field(None, max_length=50)
    owner_name: str = Field(..., min_length=2, max_length=100)


class ExternalAccountResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    account_number: str | None
    owner_name: str
    created_at: datetime

    model_config = {"from_attributes": True}
