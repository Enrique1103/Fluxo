import uuid
from datetime import datetime, timezone
from enum import Enum
from sqlalchemy import String, Boolean, DateTime, ForeignKey
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class SplitType(str, Enum):
    EQUAL        = "equal"
    PROPORTIONAL = "proportional"


class MemberRole(str, Enum):
    ADMIN  = "admin"
    MEMBER = "member"


class MemberStatus(str, Enum):
    PENDING = "pending"
    ACTIVE  = "active"


class InviteStatus(str, Enum):
    PENDING = "pending"
    USED    = "used"
    EXPIRED = "expired"


class Household(Base):
    __tablename__ = "households"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    base_currency: Mapped[str] = mapped_column(String(3), nullable=False, default="UYU")
    split_type: Mapped[SplitType] = mapped_column(
        SQLEnum(SplitType), nullable=False, default=SplitType.EQUAL
    )
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relaciones
    created_by_user = relationship("User", foreign_keys=[created_by])
    members  = relationship("HouseholdMember",  back_populates="household", cascade="all, delete-orphan")
    invites  = relationship("HouseholdInvite",  back_populates="household", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="household")


class HouseholdMember(Base):
    __tablename__ = "household_members"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    household_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("households.id"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    role: Mapped[MemberRole] = mapped_column(
        SQLEnum(MemberRole), nullable=False, default=MemberRole.MEMBER
    )
    status: Mapped[MemberStatus] = mapped_column(
        SQLEnum(MemberStatus), nullable=False, default=MemberStatus.PENDING
    )
    joined_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relaciones
    household = relationship("Household", back_populates="members")
    user      = relationship("User")


class HouseholdInvite(Base):
    __tablename__ = "household_invites"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    household_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("households.id"), nullable=False
    )
    code: Mapped[str] = mapped_column(String(20), nullable=False, unique=True, index=True)
    created_by: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), nullable=False)
    status: Mapped[InviteStatus] = mapped_column(
        SQLEnum(InviteStatus), nullable=False, default=InviteStatus.PENDING
    )
    used_by: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    # Relaciones
    household        = relationship("Household", back_populates="invites")
    created_by_user  = relationship("User", foreign_keys=[created_by])
    used_by_user     = relationship("User", foreign_keys=[used_by])
