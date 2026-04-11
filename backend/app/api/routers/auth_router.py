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
    current_user: User = Depends(get_current_user),
):
    """Revoca el token JWT del usuario. A partir de este momento el token es inválido."""
    revoked_token_crud.add(db, token)
    db.commit()
