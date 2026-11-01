import uuid
from datetime import date as PyDate, datetime, timezone
from decimal import Decimal
from enum import Enum
from sqlalchemy import String, Boolean, Date, DateTime, ForeignKey, Integer, Numeric
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class SplitType(str, Enum):
    EQUAL        = "equal"
    PROPORTIONAL = "proportional"


class AnalysisLevel(str, Enum):
    EXPENSES_ONLY       = "expenses_only"
    EXPENSES_AND_GOALS  = "expenses_and_goals"
    FULL                = "full"


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
    analysis_level: Mapped[AnalysisLevel | None] = mapped_column(
        SQLEnum(AnalysisLevel, values_callable=lambda x: [e.value for e in x]),
        nullable=True,
        default=AnalysisLevel.EXPENSES_ONLY,
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
    transactions     = relationship("Transaction", back_populates="household")
    transaction_links = relationship("TransactionHousehold", back_populates="household", cascade="all, delete-orphan")


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


class HouseholdSettlement(Base):
    """
    Pago del balanceo de un mes del hogar: "Luis le pagó a Papá $3.500".
    El que paga elige la cuenta de donde sale (se le carga un gasto "Balanceo del Hogar")
    y el que cobra confirma a qué cuenta entró (se le carga el ingreso "Reintegro del
    Hogar", que resta de su gasto). Mientras el gasto del que paga no esté borrado,
    el pago cuenta en la liquidación de ese mes.
    """
    __tablename__ = "household_settlements"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    household_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False, index=True
    )
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    from_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    to_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    paid_date: Mapped[PyDate] = mapped_column(Date, nullable=False)
    comment: Mapped[str | None] = mapped_column(String(100), nullable=True)
    payer_tx_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True
    )
    receiver_tx_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    payer_tx    = relationship("Transaction", foreign_keys=[payer_tx_id])
    receiver_tx = relationship("Transaction", foreign_keys=[receiver_tx_id])


class MemberTransfer(Base):
    """
    Transferencia de dinero entre dos miembros del hogar (Nivel 3).
    Crea un egreso en la cuenta del emisor y un ingreso en la cuenta del receptor.
    Se descuenta del balance mensual del hogar para calcular quién le debe a quién.
    """
    __tablename__ = "member_transfers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    household_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    to_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    date: Mapped[PyDate] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(String(200), nullable=True)
    from_tx_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True
    )
    to_tx_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    from_user  = relationship("User", foreign_keys=[from_user_id])
    to_user    = relationship("User", foreign_keys=[to_user_id])
    from_tx    = relationship("Transaction", foreign_keys=[from_tx_id])
    to_tx      = relationship("Transaction", foreign_keys=[to_tx_id])


class PendingMemberTransfer(Base):
    """
    Transferencia entre miembros pendiente de aceptación por el receptor.
    El emisor la crea sin conocer la cuenta destino; el receptor elige dónde recibir.
    Al aceptar se crea el MemberTransfer definitivo y se borran estos datos.
    """
    __tablename__ = "pending_member_transfers"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    household_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False, index=True
    )
    from_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    to_user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    from_account_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=False)
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(3), nullable=False)
    date: Mapped[PyDate] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(String(200), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )

    from_user  = relationship("User", foreign_keys=[from_user_id])
    to_user    = relationship("User", foreign_keys=[to_user_id])
