import uuid
from pydantic import BaseModel, Field


# --- Creación ---
# slug se genera automáticamente en el Service a partir del name.
# icon y color son opcionales desde el inicio.
class CategoryCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=50)
    icon: str | None = Field(None, max_length=50)
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")


# --- Actualización ---
class CategoryUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=50)
    icon: str | None = Field(None, max_length=50)
    color: str | None = Field(None, pattern=r"^#[0-9A-Fa-f]{6}$")


# --- Respuesta al frontend ---
class CategoryResponse(BaseModel):
    id: uuid.UUID
    user_id: uuid.UUID
    name: str
    slug: str
    icon: str | None
    color: str | None
    is_system: bool

    model_config = {"from_attributes": True}
