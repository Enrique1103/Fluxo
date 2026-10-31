import uuid
from typing import Literal
from pydantic import BaseModel, Field


# --- Creación ---
# Todo concepto nuevo pertenece a una categoría: al registrar un movimiento
# se elige el concepto y la categoría se completa sola.
class ConceptCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    category_id: uuid.UUID


# --- Actualización ---
# Cambiar category_id mueve también los movimientos de ese concepto a la nueva categoría.
class ConceptUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=100)
    category_id: uuid.UUID | None = None


# Filtro de conceptos por tipo de movimiento (GET /concepts?type=expense)
ConceptTxType = Literal["expense", "income", "transfer"]


# --- Respuesta al frontend ---
class ConceptResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    category_id: uuid.UUID
    name: str
    frequency_score: int
    is_system: bool

    model_config = {"from_attributes": True}
