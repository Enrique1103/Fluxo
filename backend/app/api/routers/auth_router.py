from fastapi import APIRouter, Depends, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from app.api.dependeces import get_current_user, oauth2_scheme
from app.core.database import get_db
from app.crud import revoked_token_crud
from app.models.users_models import User
from app.services import user_service

router = APIRouter(prefix="/auth", tags=["Auth"])


@router.post("/login")
def login(
    form_data: OAuth2PasswordRequestForm = Depends(),
    db: Session = Depends(get_db),
):
    return user_service.login(db, email=form_data.username, password=form_data.password)


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
