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
    SettlementNotAllowed, SettlementNotFound,
)
from app.models.users_models import User
from app.schemas.household_schema import (
    HouseholdCreate, HouseholdUpdate, HouseholdResponse,
    MemberResponse, InviteResponse, JoinRequest,
    HouseholdAnalyticsResponse, SettlementPayIn, SettlementConfirmIn,
    MemberTransferIn, MemberTransferOut, MemberTransferUpdate,
    PendingMemberTransferIn, PendingMemberTransferOut, AcceptPendingTransferIn,
)
from app.services import household_service, household_analytics_service, household_settlement_service, member_transfer_service

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
        if user_id is None or payload.get("is_admin") or payload.get("purpose"):
            raise credentials_exception
        user_uuid = uuid.UUID(user_id)
    except (JWTError, ValueError):
        raise credentials_exception
    user = user_crud.get_by_id(db, user_uuid)
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
        SettlementNotAllowed:        (422, str),
        SettlementNotFound:          (404, str),
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


@router.get("/{household_id}/members/{user_id}/accounts")
def get_member_accounts(
    household_id: uuid.UUID,
    user_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Devuelve las cuentas activas de un miembro del hogar."""
    from app.crud import account_crud, household_crud
    hh = household_crud.get_by_id(db, household_id)
    if not hh or hh.is_deleted:
        raise HTTPException(status_code=404, detail="Hogar no encontrado")
    member = household_crud.get_member(db, household_id, current_user.id)
    if not member or member.status.value != "active":
        raise HTTPException(status_code=403, detail="No sos miembro activo")
    accounts = account_crud.get_all_by_user(db, user_id)
    active = [a for a in accounts if not a.is_deleted and not a.is_archived]
    return [{"id": str(a.id), "name": a.name, "type": a.type, "currency": a.currency, "balance": float(a.balance)} for a in active]


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


# ---------------------------------------------------------------------------
# Balanceo del mes: registrar el pago y confirmar que llegó
# ---------------------------------------------------------------------------

@router.post("/{household_id}/settlements", status_code=status.HTTP_201_CREATED)
def pay_settlement(
    household_id: uuid.UUID,
    data: SettlementPayIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """El que debe registra el pago (elige de qué cuenta sale). El monto lo calcula Hogar."""
    try:
        s = household_settlement_service.pay(db, current_user, household_id, data)
        return {"id": str(s.id), "amount": str(s.amount), "currency": s.currency}
    except Exception as e:
        _handle(e)


@router.post("/{household_id}/settlements/{settlement_id}/confirm")
def confirm_settlement(
    household_id: uuid.UUID,
    settlement_id: uuid.UUID,
    data: SettlementConfirmIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """El que cobra confirma a qué cuenta entró la plata."""
    try:
        s = household_settlement_service.confirm(db, current_user, household_id, settlement_id, data)
        return {"id": str(s.id), "confirmed": True}
    except Exception as e:
        _handle(e)


# ── Transferencias entre miembros ────────────────────────────────────────────

@router.post("/{household_id}/member-transfers", response_model=MemberTransferOut, status_code=status.HTTP_201_CREATED)
def create_member_transfer(
    household_id: uuid.UUID,
    data: MemberTransferIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Crea una transferencia entre miembros del hogar."""
    try:
        t = member_transfer_service.create(
            db, current_user, household_id,
            to_user_id=data.to_user_id,
            from_account_id=data.from_account_id,
            to_account_id=data.to_account_id,
            amount=data.amount,
            currency=data.currency,
            date=data.date,
            description=data.description,
        )
        from app.crud import user_crud
        from_name = current_user.name
        to_user = user_crud.get_by_id(db, t.to_user_id)
        to_name = to_user.name if to_user else ""
        return MemberTransferOut(
            id=t.id,
            household_id=t.household_id,
            from_user_id=t.from_user_id,
            from_user_name=from_name,
            to_user_id=t.to_user_id,
            to_user_name=to_name,
            amount=t.amount,
            currency=t.currency,
            date=str(t.date),
            description=t.description,
            created_at=str(t.created_at),
        )
    except Exception as e:
        _handle(e)


@router.patch("/{household_id}/member-transfers/{transfer_id}", response_model=MemberTransferOut)
def update_member_transfer(
    household_id: uuid.UUID,
    transfer_id: uuid.UUID,
    data: MemberTransferUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Edita monto, moneda, fecha o descripción de una transferencia entre miembros."""
    try:
        t = member_transfer_service.update(
            db, current_user, household_id, transfer_id,
            amount=data.amount,
            currency=data.currency,
            date=data.date,
            description=data.description,
        )
        from app.crud import user_crud
        to_user = user_crud.get_by_id(db, t.to_user_id)
        return MemberTransferOut(
            id=t.id,
            household_id=t.household_id,
            from_user_id=t.from_user_id,
            from_user_name=current_user.name,
            to_user_id=t.to_user_id,
            to_user_name=to_user.name if to_user else "",
            amount=t.amount,
            currency=t.currency,
            date=str(t.date),
            description=t.description,
            created_at=str(t.created_at),
        )
    except Exception as e:
        _handle(e)


@router.delete("/{household_id}/member-transfers/{transfer_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_member_transfer(
    household_id: uuid.UUID,
    transfer_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Elimina una transferencia entre miembros y sus transacciones asociadas."""
    try:
        member_transfer_service.delete(db, current_user, household_id, transfer_id)
    except Exception as e:
        _handle(e)


# ---------------------------------------------------------------------------
# Transferencias pendientes
# ---------------------------------------------------------------------------

def _pending_out(p) -> PendingMemberTransferOut:
    from app.crud import user_crud as _uc
    return PendingMemberTransferOut(
        id=p.id,
        household_id=p.household_id,
        from_user_id=p.from_user_id,
        from_user_name=p.from_user.name if p.from_user else str(p.from_user_id),
        to_user_id=p.to_user_id,
        to_user_name=p.to_user.name if p.to_user else str(p.to_user_id),
        amount=p.amount,
        currency=p.currency,
        date=str(p.date),
        description=p.description,
        created_at=p.created_at.isoformat(),
    )


@router.post("/{household_id}/pending-member-transfers", response_model=PendingMemberTransferOut, status_code=status.HTTP_201_CREATED)
def create_pending_member_transfer(
    household_id: uuid.UUID,
    data: PendingMemberTransferIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """El emisor inicia una transferencia sin elegir la cuenta del receptor."""
    try:
        p = member_transfer_service.create_pending(
            db, current_user, household_id,
            to_user_id=data.to_user_id,
            from_account_id=data.from_account_id,
            amount=data.amount,
            currency=data.currency,
            date=data.date,
            description=data.description,
        )
        return _pending_out(p)
    except Exception as e:
        _handle(e)


@router.get("/{household_id}/pending-member-transfers", response_model=list[PendingMemberTransferOut])
def list_pending_member_transfers(
    household_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Lista todas las transferencias pendientes del hogar (emisor y receptor las ven)."""
    try:
        pending = member_transfer_service.list_pending(db, current_user, household_id)
        return [_pending_out(p) for p in pending]
    except Exception as e:
        _handle(e)


@router.post("/{household_id}/pending-member-transfers/{pending_id}/accept", response_model=MemberTransferOut)
def accept_pending_member_transfer(
    household_id: uuid.UUID,
    pending_id: uuid.UUID,
    data: AcceptPendingTransferIn,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """El receptor acepta la transferencia eligiendo su cuenta destino."""
    try:
        t = member_transfer_service.accept_pending(
            db, current_user, household_id, pending_id, data.to_account_id
        )
        from app.crud import user_crud
        to_user = user_crud.get_by_id(db, t.to_user_id)
        from_user = user_crud.get_by_id(db, t.from_user_id)
        return MemberTransferOut(
            id=t.id,
            household_id=t.household_id,
            from_user_id=t.from_user_id,
            from_user_name=from_user.name if from_user else str(t.from_user_id),
            to_user_id=t.to_user_id,
            to_user_name=to_user.name if to_user else str(t.to_user_id),
            amount=t.amount,
            currency=t.currency,
            date=str(t.date),
            description=t.description,
            created_at=t.created_at.isoformat(),
        )
    except Exception as e:
        _handle(e)


@router.delete("/{household_id}/pending-member-transfers/{pending_id}", status_code=status.HTTP_204_NO_CONTENT)
def cancel_pending_member_transfer(
    household_id: uuid.UUID,
    pending_id: uuid.UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Cancela una transferencia pendiente (emisor o receptor)."""
    try:
        member_transfer_service.cancel_pending(db, current_user, household_id, pending_id)
    except Exception as e:
        _handle(e)
