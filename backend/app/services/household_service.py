import uuid
from datetime import datetime, timezone
from sqlalchemy.orm import Session

from app.crud import household_crud
from app.exceptions.household_exceptions import (
    HouseholdNotFound, UnauthorizedHouseholdAccess, NotHouseholdAdmin,
    AlreadyHouseholdMember, MemberNotFound, InviteNotFound,
    InviteExpired, InviteAlreadyUsed, CannotRemoveLastAdmin,
)
from app.models.household_models import (
    Household, HouseholdMember, HouseholdInvite,
    SplitType, MemberRole, MemberStatus, InviteStatus,
)
from app.models.users_models import User
from app.schemas.household_schema import (
    HouseholdCreate, HouseholdUpdate, HouseholdResponse,
    MemberResponse, InviteResponse,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _get_household(db: Session, household_id: uuid.UUID) -> Household:
    h = household_crud.get_by_id(db, household_id)
    if not h:
        raise HouseholdNotFound("Hogar no encontrado")
    return h


def _require_active_member(db: Session, household_id: uuid.UUID, user_id: uuid.UUID) -> HouseholdMember:
    m = household_crud.get_member(db, household_id, user_id)
    if not m or m.status != MemberStatus.ACTIVE:
        raise UnauthorizedHouseholdAccess("No sos miembro activo de este hogar")
    return m


def _require_admin(db: Session, household_id: uuid.UUID, user_id: uuid.UUID) -> HouseholdMember:
    m = _require_active_member(db, household_id, user_id)
    if m.role != MemberRole.ADMIN:
        raise NotHouseholdAdmin("Solo el admin puede realizar esta acción")
    return m


def _member_to_response(m: HouseholdMember) -> MemberResponse:
    return MemberResponse(
        id=m.id,
        household_id=m.household_id,
        user_id=m.user_id,
        user_name=m.user.name,
        role=m.role,
        status=m.status,
        joined_at=m.joined_at,
    )


# ---------------------------------------------------------------------------
# Household CRUD
# ---------------------------------------------------------------------------

def create(db: Session, user: User, data: HouseholdCreate) -> HouseholdResponse:
    h = household_crud.create(
        db,
        name=data.name,
        base_currency=data.base_currency,
        split_type=data.split_type,
        created_by=user.id,
    )
    # Creator becomes admin immediately
    household_crud.add_member(
        db, h.id, user.id,
        role=MemberRole.ADMIN,
        status=MemberStatus.ACTIVE,
    )
    db.commit()
    return HouseholdResponse.model_validate(h)


def get_all(db: Session, user: User) -> list[HouseholdResponse]:
    households = household_crud.get_all_by_user(db, user.id)
    return [HouseholdResponse.model_validate(h) for h in households]


def get_one(db: Session, user: User, household_id: uuid.UUID) -> HouseholdResponse:
    h = _get_household(db, household_id)
    _require_active_member(db, household_id, user.id)
    return HouseholdResponse.model_validate(h)


def update(db: Session, user: User, household_id: uuid.UUID, data: HouseholdUpdate) -> HouseholdResponse:
    h = _get_household(db, household_id)
    _require_admin(db, household_id, user.id)
    fields = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    if fields:
        household_crud.update(db, h, fields)
    db.commit()
    return HouseholdResponse.model_validate(h)


def delete(db: Session, user: User, household_id: uuid.UUID) -> None:
    h = _get_household(db, household_id)
    _require_admin(db, household_id, user.id)
    household_crud.soft_delete(db, h)
    db.commit()


# ---------------------------------------------------------------------------
# Invites
# ---------------------------------------------------------------------------

def generate_invite(db: Session, user: User, household_id: uuid.UUID) -> InviteResponse:
    _get_household(db, household_id)
    _require_admin(db, household_id, user.id)
    invite = household_crud.create_invite(db, household_id, user.id)
    db.commit()
    return InviteResponse.model_validate(invite)


def join_by_code(db: Session, user: User, code: str) -> MemberResponse:
    household_crud.expire_stale_invites(db)
    invite = household_crud.get_invite_by_code(db, code)

    if not invite:
        raise InviteNotFound("Código de invitación no válido")
    if invite.status == InviteStatus.EXPIRED:
        raise InviteExpired("El código de invitación expiró")
    if invite.status == InviteStatus.USED:
        raise InviteAlreadyUsed("Este código ya fue utilizado")
    now = datetime.now(timezone.utc)
    exp = invite.expires_at
    # SQLite devuelve datetimes naive; normalizar para comparar
    if exp.tzinfo is None:
        exp = exp.replace(tzinfo=timezone.utc)
    if now > exp:
        invite.status = InviteStatus.EXPIRED
        db.flush()
        raise InviteExpired("El código de invitación expiró")

    existing = household_crud.get_member(db, invite.household_id, user.id)
    if existing:
        raise AlreadyHouseholdMember("Ya sos miembro de este hogar")

    member = household_crud.add_member(
        db, invite.household_id, user.id,
        role=MemberRole.MEMBER,
        status=MemberStatus.PENDING,
    )
    household_crud.use_invite(db, invite, user.id)
    db.commit()
    return _member_to_response(member)


# ---------------------------------------------------------------------------
# Members
# ---------------------------------------------------------------------------

def list_members(db: Session, user: User, household_id: uuid.UUID) -> list[MemberResponse]:
    _get_household(db, household_id)
    _require_active_member(db, household_id, user.id)
    members = household_crud.get_active_members(db, household_id)
    pending = household_crud.get_pending_members(db, household_id)
    return [_member_to_response(m) for m in members + pending]


def approve_member(db: Session, user: User, household_id: uuid.UUID, target_user_id: uuid.UUID) -> MemberResponse:
    _get_household(db, household_id)
    _require_admin(db, household_id, user.id)
    member = household_crud.get_member(db, household_id, target_user_id)
    if not member or member.status != MemberStatus.PENDING:
        raise MemberNotFound("Solicitud de membresía no encontrada")
    household_crud.approve_member(db, member)
    db.commit()
    return _member_to_response(member)


def remove_member(db: Session, user: User, household_id: uuid.UUID, target_user_id: uuid.UUID) -> None:
    _get_household(db, household_id)
    _require_admin(db, household_id, user.id)

    if target_user_id == user.id:
        # Admin leaving — check there's another admin
        admin_count = household_crud.count_admins(db, household_id)
        if admin_count <= 1:
            raise CannotRemoveLastAdmin("No podés abandonar el hogar siendo el único admin. Asigná otro admin primero.")

    member = household_crud.get_member(db, household_id, target_user_id)
    if not member:
        raise MemberNotFound("Miembro no encontrado")
    household_crud.remove_member(db, member)
    db.commit()
