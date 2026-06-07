import uuid
from datetime import datetime, timezone
from enum import Enum
from sqlalchemy import String, DateTime, ForeignKey, Index
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class ReviewType(str, Enum):
    UNNECESSARY    = "innecesario"
    HIGH_AMOUNT    = "monto_alto"
    WRONG_CATEGORY = "categoria_incorrecta"
    NOT_HOUSEHOLD  = "no_es_del_hogar"
    SUSPICIOUS     = "sospechoso"
    QUESTION       = "pregunta"
    OTHER          = "otra"


class ReviewStatus(str, Enum):
    PENDING      = "pendiente"
    ACKNOWLEDGED = "respondida"
    DISMISSED    = "descartada"
    RESOLVED     = "resuelta"


class TransactionReview(Base):
    __tablename__ = "transaction_reviews"
    __table_args__ = (
        Index("ix_reviews_transaction", "transaction_id"),
        Index("ix_reviews_household",   "household_id"),
        Index("ix_reviews_status",      "status"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False
    )
    household_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("households.id", ondelete="CASCADE"), nullable=False
    )
    flagged_by_user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    flag_type: Mapped[ReviewType] = mapped_column(
        SQLEnum(ReviewType, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
    )
    comment: Mapped[str | None] = mapped_column(String(500), nullable=True)
    status: Mapped[ReviewStatus] = mapped_column(
        SQLEnum(ReviewStatus, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=ReviewStatus.PENDING,
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
    response_comment: Mapped[str | None] = mapped_column(String(500), nullable=True)
    response_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    # Relaciones
    transaction     = relationship("Transaction")
    household       = relationship("Household")
    flagged_by_user = relationship("User", foreign_keys=[flagged_by_user_id])
