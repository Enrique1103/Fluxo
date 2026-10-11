"""Recuperar contraseña por email.

El enlace lleva un token firmado que vence en 30 minutos y que incluye una huella de la
contraseña actual: apenas se cambia la contraseña, el enlace deja de servir (un solo uso),
sin necesidad de guardar nada en la base.
"""
import hashlib
import html as html_lib
import logging
import os
import uuid
from datetime import timedelta

from jose import JWTError, jwt
from sqlalchemy.orm import Session

from app.core import security
from app.crud import user_crud
from app.exceptions.user_exceptions import InvalidCredentials
from app.models.users_models import User

RESET_MINUTES = 30
_PURPOSE = "password_reset"
audit = logging.getLogger("fluxo.audit")


def _fingerprint(user: User) -> str:
    return hashlib.sha256(user.password_hash.encode()).hexdigest()[:16]


def create_reset_token(user: User) -> str:
    return security.create_access_token(
        {"sub": str(user.id), "purpose": _PURPOSE, "fp": _fingerprint(user)},
        expires_delta=timedelta(minutes=RESET_MINUTES),
    )


def _frontend_url() -> str:
    return os.getenv("FRONTEND_URL", "https://fluxo-sage.vercel.app").rstrip("/")


def request_reset(db: Session, email: str) -> tuple[str, str, str, str] | None:
    """Arma el email con el enlace si la cuenta existe: (para, asunto, texto, html).
    Devuelve None si no existe; quien llama responde igual en ambos casos (no revela quién tiene cuenta)."""
    user = user_crud.get_by_email(db, email.strip().lower()) or user_crud.get_by_email(db, email.strip())
    if not user or not user.is_active:
        return None
    link = f"{_frontend_url()}/reset-password?token={create_reset_token(user)}"
    text = (
        f"Hola {user.name},\n\n"
        "Recibimos un pedido para cambiar la contraseña de tu cuenta de Fluxo.\n"
        f"Para elegir una nueva, abrí este enlace (vence en {RESET_MINUTES} minutos):\n\n"
        f"{link}\n\n"
        "Si no lo pediste vos, ignorá este email: tu contraseña no cambia.\n\n"
        "— Fluxo"
    )
    name = html_lib.escape(user.name)
    html = f"""<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#0f172a">
  <h2 style="color:#059669">Fluxo</h2>
  <p>Hola {name},</p>
  <p>Recibimos un pedido para cambiar la contraseña de tu cuenta.</p>
  <p><a href="{link}" style="display:inline-block;background:#10b981;color:#fff;padding:12px 20px;
     border-radius:10px;text-decoration:none;font-weight:bold">Elegir nueva contraseña</a></p>
  <p style="color:#64748b;font-size:13px">El enlace vence en {RESET_MINUTES} minutos.
     Si no lo pediste vos, ignorá este email: tu contraseña no cambia.</p>
</div>"""
    audit.warning("pedido de cambio de contraseña para usuario %s", user.id)
    return user.email, "Cambiá tu contraseña de Fluxo", text, html


def reset_password(db: Session, token: str, new_password: str) -> None:
    invalid = InvalidCredentials("El enlace no es válido o ya venció. Pedí uno nuevo.")
    try:
        payload = jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
        if payload.get("purpose") != _PURPOSE:
            raise invalid
        user_id = uuid.UUID(payload.get("sub", ""))
    except (JWTError, ValueError):
        raise invalid
    user = user_crud.get_by_id(db, user_id)
    if not user or not user.is_active or payload.get("fp") != _fingerprint(user):
        raise invalid
    try:
        user.password_hash = security.hash_password(new_password)
        db.commit()
    except Exception:
        db.rollback()
        raise
    audit.warning("usuario %s cambió su contraseña con el enlace de recuperación", user.id)
