import uuid
from pydantic import BaseModel, Field


# --- Creación ---
class ConceptCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)


# --- Actualización ---
class ConceptUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=100)


# --- Respuesta al frontend ---
class ConceptResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    category_id: uuid.UUID
    name: str
    frequency_score: int
    is_system: bool

    model_config = {"from_attributes": True}
