import uuid
from typing import Literal
from pydantic import BaseModel, Field, field_validator

from app.models.categories_models import normalize_kind

# Para qué tipo de movimiento se ofrecen los conceptos de la categoría:
# expense (gastos), income (ingresos), transfer (transferencias/retiros), any (todos)
# o dos de ellos separados por coma (ej: "expense,income").
CategoryKind = str


# --- Creación ---
# slug se genera automáticamente en el Service a partir del name.
# icon y color son opcionales desde el inicio.
class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=50)
    icon: str | None = Field(None, max_length=50)
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    kind: CategoryKind = "expense"

    @field_validator("kind", mode="before")
    @classmethod
    def _kind(cls, v):
        return normalize_kind(v)


# --- Actualización ---
class CategoryUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=50)
    icon: str | None = Field(None, max_length=50)
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")
    kind: CategoryKind | None = None

    @field_validator("kind", mode="before")
    @classmethod
    def _kind(cls, v):
        return None if v is None else normalize_kind(v)


# --- Respuesta al frontend ---
class CategoryResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    slug: str
    icon: str | None
    color: str | None
    is_system: bool
    kind: str = "expense"

    model_config = {"from_attributes": True}
