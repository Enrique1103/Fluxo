import random
import string
import uuid
from datetime import datetime, timedelta, timezone

from sqlalchemy.orm import Session

from app.models.household_models import (
    Household, HouseholdMember, HouseholdInvite,
    SplitType, MemberRole, MemberStatus, InviteStatus,
)


# ---------------------------------------------------------------------------
# Household
# ---------------------------------------------------------------------------

def get_by_id(db: Session, household_id: uuid.UUID) -> Household | None:
    return db.query(Household).filter(
        Household.id == household_id,
        Household.is_deleted == False,
    ).first()


def get_all_by_user(db: Session, user_id: uuid.UUID) -> list[Household]:
    return (
        db.query(Household)
        .join(HouseholdMember, HouseholdMember.household_id == Household.id)
        .filter(
            HouseholdMember.user_id == user_id,
            HouseholdMember.status == MemberStatus.ACTIVE,
            Household.is_deleted == False,
        )
        .order_by(Household.created_at.asc())
        .all()
    )


def create(
    db: Session,
    name: str,
    base_currency: str,
    split_type: SplitType,
    created_by: uuid.UUID,
) -> Household:
    h = Household(
        name=name,
        base_currency=base_currency.upper(),
        split_type=split_type,
        created_by=created_by,
    )
    db.add(h)
    db.flush()
    return h


def update(db: Session, household: Household, fields: dict) -> Household:
    for key, value in fields.items():
        setattr(household, key, value)
    db.flush()
    return household


def soft_delete(db: Session, household: Household) -> None:
    household.is_deleted = True
    db.flush()


# ---------------------------------------------------------------------------
# HouseholdMember
# ---------------------------------------------------------------------------

def get_member(db: Session, household_id: uuid.UUID, user_id: uuid.UUID) -> HouseholdMember | None:
    return db.query(HouseholdMember).filter(
        HouseholdMember.household_id == household_id,
        HouseholdMember.user_id == user_id,
    ).first()


def get_active_members(db: Session, household_id: uuid.UUID) -> list[HouseholdMember]:
    return (
        db.query(HouseholdMember)
        .filter(
            HouseholdMember.household_id == household_id,
            HouseholdMember.status == MemberStatus.ACTIVE,
        )
        .all()
    )


def get_pending_members(db: Session, household_id: uuid.UUID) -> list[HouseholdMember]:
    return (
        db.query(HouseholdMember)
        .filter(
            HouseholdMember.household_id == household_id,
            HouseholdMember.status == MemberStatus.PENDING,
        )
        .all()
    )


def add_member(
    db: Session,
    household_id: uuid.UUID,
    user_id: uuid.UUID,
    role: MemberRole = MemberRole.MEMBER,
    status: MemberStatus = MemberStatus.PENDING,
) -> HouseholdMember:
    now = datetime.now(timezone.utc)
    m = HouseholdMember(
        household_id=household_id,
        user_id=user_id,
        role=role,
        status=status,
        joined_at=now if status == MemberStatus.ACTIVE else None,
    )
    db.add(m)
    db.flush()
    return m


def approve_member(db: Session, member: HouseholdMember) -> HouseholdMember:
    member.status = MemberStatus.ACTIVE
    member.joined_at = datetime.now(timezone.utc)
    db.flush()
    return member


def remove_member(db: Session, member: HouseholdMember) -> None:
    db.delete(member)
    db.flush()


def count_admins(db: Session, household_id: uuid.UUID) -> int:
    return db.query(HouseholdMember).filter(
        HouseholdMember.household_id == household_id,
        HouseholdMember.role == MemberRole.ADMIN,
        HouseholdMember.status == MemberStatus.ACTIVE,
    ).count()


# ---------------------------------------------------------------------------
# HouseholdInvite
# ---------------------------------------------------------------------------

def _generate_code() -> str:
    chars = string.ascii_uppercase + string.digits
    return "".join(random.choices(chars, k=8))


def create_invite(db: Session, household_id: uuid.UUID, created_by: uuid.UUID) -> HouseholdInvite:
    # Expire any existing pending invites for this household
    db.query(HouseholdInvite).filter(
        HouseholdInvite.household_id == household_id,
        HouseholdInvite.status == InviteStatus.PENDING,
    ).update({"status": InviteStatus.EXPIRED})

    code = _generate_code()
    invite = HouseholdInvite(
        household_id=household_id,
        code=code,
        created_by=created_by,
        expires_at=datetime.now(timezone.utc) + timedelta(hours=48),
        status=InviteStatus.PENDING,
    )
    db.add(invite)
    db.flush()
    return invite


def get_invite_by_code(db: Session, code: str) -> HouseholdInvite | None:
    return db.query(HouseholdInvite).filter(
        HouseholdInvite.code == code.upper(),
    ).first()


def use_invite(db: Session, invite: HouseholdInvite, user_id: uuid.UUID) -> HouseholdInvite:
    invite.status = InviteStatus.USED
    invite.used_by = user_id
    db.flush()
    return invite


def expire_stale_invites(db: Session) -> None:
    now = datetime.now(timezone.utc)
    db.query(HouseholdInvite).filter(
        HouseholdInvite.status == InviteStatus.PENDING,
        HouseholdInvite.expires_at < now,
    ).update({"status": InviteStatus.EXPIRED})
    db.flush()
