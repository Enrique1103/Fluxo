import asyncio
import json
import uuid
from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import StreamingResponse
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from app.api.dependeces import get_current_user
from app.core import event_bus, security
from app.core.database import get_db
from app.crud import user_crud, revoked_token_crud
from app.exceptions.household_exceptions import (
    HouseholdNotFound, UnauthorizedHouseholdAccess, NotHouseholdAdmin,
    AlreadyHouseholdMember, MemberNotFound, InviteNotFound,
    InviteExpired, InviteAlreadyUsed, CannotRemoveLastAdmin,
)
from app.models.users_models import User
from app.schemas.household_schema import (
    HouseholdCreate, HouseholdUpdate, HouseholdResponse,
    MemberResponse, InviteResponse, JoinRequest,
    HouseholdAnalyticsResponse,
)
from app.services import household_service, household_analytics_service

router = APIRouter(prefix="/households", tags=["Households"])


# ---------------------------------------------------------------------------
# SSE — Eventos en tiempo real para el usuario autenticado
# ---------------------------------------------------------------------------

def _get_user_from_token(token: str, db: Session) -> uuid.UUID:
    """Valida el token JWT y devuelve el user_id. Lanza HTTPException si inválido."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Token inválido",
    )
    if revoked_token_crud.is_revoked(db, token):
        raise credentials_exception
    try:
        payload = jwt.decode(token, security.SECRET_KEY, algorithms=[security.ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise credentials_exception
    except JWTError:
        raise credentials_exception
    user = user_crud.get_by_id(db, uuid.UUID(user_id))
    if not user or not user.is_active:
        raise credentials_exception
    return user.id


@router.get("/events")
async def household_events(
    token: str = Query(...),
    db: Session = Depends(get_db),
):
    """SSE: el cliente se conecta una vez y recibe eventos push del servidor."""
    user_id = str(_get_user_from_token(token, db))

    async def stream():
        q = await event_bus.subscribe(user_id)
        try:
            yield "data: {\"type\": \"connected\"}\n\n"
            while True:
                try:
                    ev = await asyncio.wait_for(q.get(), timeout=25.0)
                    yield f"data: {json.dumps(ev)}\n\n"
                except asyncio.TimeoutError:
                    yield ": ping\n\n"
        finally:
            event_bus.unsubscribe(user_id, q)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def _handle(exc: Exception) -> HTTPException:
    mapping = {
        HouseholdNotFound:           (404, str),
        UnauthorizedHouseholdAccess: (403, str),
        NotHouseholdAdmin:           (403, str),
        AlreadyHouseholdMember:      (409, str),
        MemberNotFound:              (404, str),
        InviteNotFound:              (404, str),
        InviteExpired:               (410, str),
        InviteAlreadyUsed:           (409, str),
        CannotRemoveLastAdmin:       (422, str),
    }
    for exc_type, (code, _) in mapping.items():
        if isinstance(exc, exc_type):
            raise HTTPException(status_code=code, detail=str(exc))
    raise exc


# ---------------------------------------------------------------------------
# Household CRUD
# ---------------------------------------------------------------------------

@router.post("", response_model=HouseholdResponse, status_code=status.HTTP_201_CREATED)
def create_household(
    data: HouseholdCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return household_service.create(db, current_user, data)
    except Exception as e:
        _handle(e)


@router.get("", response_model=list[HouseholdResponse])
def list_households(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return household_service.get_all(db, current_user)


@router.get("/{household_id}", response_model=HouseholdResponse)
def get_household(
    household_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return household_service.get_one(db, current_user, household_id)
    except Exception as e:
        _handle(e)


@router.patch("/{household_id}", response_model=HouseholdResponse)
def update_household(
    household_id: uuid.UUID,
    data: HouseholdUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return household_service.update(db, current_user, household_id, data)
    except Exception as e:
        _handle(e)


@router.delete("/{household_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_household(
    household_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        household_service.delete(db, current_user, household_id)
    except Exception as e:
        _handle(e)


# ---------------------------------------------------------------------------
# Invites
# ---------------------------------------------------------------------------

@router.post("/{household_id}/invite", response_model=InviteResponse)
def generate_invite(
    household_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return household_service.generate_invite(db, current_user, household_id)
    except Exception as e:
        _handle(e)


@router.post("/join", response_model=MemberResponse, status_code=status.HTTP_201_CREATED)
def join_household(
    body: JoinRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return household_service.join_by_code(db, current_user, body.code)
    except Exception as e:
        _handle(e)


# ---------------------------------------------------------------------------
# Members
# ---------------------------------------------------------------------------

@router.get("/{household_id}/members", response_model=list[MemberResponse])
def list_members(
    household_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return household_service.list_members(db, current_user, household_id)
    except Exception as e:
        _handle(e)


@router.post("/{household_id}/members/{user_id}/approve", response_model=MemberResponse)
async def approve_member(
    household_id: uuid.UUID,
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        result = household_service.approve_member(db, current_user, household_id, user_id)
        # Notificar al miembro aprobado para que actualice su lista de hogares
        await event_bus.publish(str(user_id), {
            "type": "approved",
            "household_id": str(household_id),
        })
        return result
    except Exception as e:
        _handle(e)


@router.delete("/{household_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_member(
    household_id: uuid.UUID,
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        household_service.remove_member(db, current_user, household_id, user_id)
        await event_bus.publish(str(user_id), {
            "type": "removed",
            "household_id": str(household_id),
        })
    except Exception as e:
        _handle(e)


# ---------------------------------------------------------------------------
# Analytics
# ---------------------------------------------------------------------------

@router.get("/{household_id}/analytics", response_model=HouseholdAnalyticsResponse)
def get_analytics(
    household_id: uuid.UUID,
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    try:
        return household_analytics_service.get_analytics(
            db, current_user, household_id, year, month
        )
    except Exception as e:
        _handle(e)
