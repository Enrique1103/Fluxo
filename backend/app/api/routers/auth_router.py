from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api.dependeces import get_current_user, oauth2_scheme
from app.core.database import get_db
from app.core import mailer, rate_limit
from app.crud import revoked_token_crud
from app.exceptions.user_exceptions import InvalidCredentials
from app.models.users_models import User
from app.schemas.user_schema import ForgotPasswordRequest, ResetPasswordRequest
from app.services import password_reset_service, user_service

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login")
def login(
    request: Request,
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    # Freno contra adivinar contraseñas: muchos fallos seguidos bloquean un rato
    email_key = f"email:{form_data.username.strip().lower()}"
    ip_key = f"ip:{_client_ip(request)}"
    wait = rate_limit.retry_after({email_key: rate_limit.MAX_FAILURES, ip_key: rate_limit.MAX_FAILURES_PER_IP})
    if wait:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=f"Demasiados intentos fallidos. Probá de nuevo en {max(1, wait // 60)} minuto(s).",
            headers={"Retry-After": str(wait)},
        )
    try:
        result = user_service.login(db, email=form_data.username, password=form_data.password)
    except InvalidCredentials:
        rate_limit.register_failure(email_key, ip_key)
        raise
    rate_limit.reset(email_key)
    return result


def _client_ip(request: Request) -> str:
    # Render y Vercel ponen la IP real del cliente primera en X-Forwarded-For
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(
    db: Session = Depends(get_db),
    token: str = Depends(oauth2_scheme),
):
    """Revoca el token JWT (de usuario o de admin). A partir de este momento el token es inválido."""
    from jose import jwt, JWTError
    from fastapi import HTTPException
    from app.core import security
    try:
        jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token inválido")
    if revoked_token_crud.is_revoked(db, token):
        return
    revoked_token_crud.add(db, token)
    db.commit()



@router.post("/forgot-password", status_code=status.HTTP_202_ACCEPTED)
def forgot_password(
    body: ForgotPasswordRequest,
    request: Request,
    background: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Manda un enlace para cambiar la contraseña. Responde lo mismo exista o no el email."""
    email_key = f"reset:{body.email.lower()}"
    ip_key = f"reset-ip:{_client_ip(request)}"
    if rate_limit.retry_after({email_key: 3, ip_key: 10}):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail="Ya pediste varios enlaces. Revisá tu correo (también la carpeta de spam) o probá más tarde.",
        )
    rate_limit.register_failure(email_key, ip_key)
    message = password_reset_service.request_reset(db, body.email)
    if message:
        # El envío va en segundo plano: la respuesta tarda lo mismo exista o no la cuenta
        background.add_task(mailer.send_email, *message)
    return {"detail": "Si el email está registrado, te enviamos un enlace para cambiar la contraseña."}


@router.post("/reset-password", status_code=status.HTTP_204_NO_CONTENT)
def reset_password(body: ResetPasswordRequest, db: Session = Depends(get_db)):
    password_reset_service.reset_password(db, body.token, body.new_password)
