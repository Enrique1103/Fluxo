import uuid
from datetime import date as PyDate, datetime
from decimal import Decimal
from pydantic import BaseModel, Field


# --- Creación ---
class FinGoalCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    target_amount: Decimal = Field(..., gt=0)
    allocation_pct: Decimal = Field(..., ge=0, le=100)
    deadline: PyDate | None = None


# --- Actualización ---
class FinGoalUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=100)
    target_amount: Decimal | None = Field(None, gt=0)
    allocation_pct: Decimal | None = Field(None, ge=0, le=100)
    deadline: PyDate | None = None


# --- Respuesta al frontend ---
class FinGoalResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    target_amount: Decimal
    allocation_pct: Decimal
    deadline: PyDate | None
    is_completed: bool
    created_at: datetime
    current_amount: Decimal | None = None

    model_config = {"from_attributes": True}
