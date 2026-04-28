import uuid
from datetime import datetime
from pydantic import BaseModel, EmailStr, Field, field_validator

_CURRENCY_PATTERN = r"^[A-Z]{2,10}$"


def _validate_password_strength(v: str) -> str:
    errors = []
    if not any(c.islower() for c in v):
        errors.append("una minúscula")
    if not any(c.isupper() for c in v):
        errors.append("una mayúscula")
    if not any(c.isdigit() for c in v):
        errors.append("un número")
    if not any(c in "@$!%*?&" for c in v):
        errors.append("un carácter especial (@$!%*?&)")
    if errors:
        raise ValueError(f"La contraseña debe contener: {', '.join(errors)}")
    return v


# --- Registro ---
class UserCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8, max_length=20, repr=False)
    currency_default: str = Field(default="UYU", pattern=_CURRENCY_PATTERN)

    @field_validator("password")
    @classmethod
    def validate_password(cls, v: str) -> str:
        return _validate_password_strength(v)


# --- Actualización de perfil ---
class UserUpdate(BaseModel):
    name: str | None = Field(None, min_length=2, max_length=100)
    currency_default: str | None = Field(None, pattern=_CURRENCY_PATTERN)
    current_password: str | None = Field(None, repr=False)
    new_password: str | None = Field(None, min_length=8, max_length=20, repr=False)

    @field_validator("new_password")
    @classmethod
    def validate_new_password(cls, v: str | None) -> str | None:
        if v is not None:
            return _validate_password_strength(v)
        return v


# --- Eliminación de cuenta ---
class UserDeleteRequest(BaseModel):
    password: str = Field(..., repr=False)


# --- Respuesta al frontend ---
class UserResponse(BaseModel):
    id: uuid.UUID
    name: str
    email: EmailStr
    currency_default: str
    is_active: bool
    created_at: datetime

    model_config = {"from_attributes": True}
