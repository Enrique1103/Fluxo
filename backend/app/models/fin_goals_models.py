import uuid
from datetime import date as PyDate, datetime, timezone
from decimal import Decimal
from sqlalchemy import String, Boolean, Date, DateTime, Numeric, ForeignKey, CheckConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class FinGoal(Base):
    __tablename__ = "fin_goals"
    __table_args__ = (
        CheckConstraint(
            "allocation_pct BETWEEN 0.00 AND 100.00",
            name="check_fin_goal_allocation_range"
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    target_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    allocation_pct: Mapped[Decimal] = mapped_column(
        Numeric(5, 2), nullable=False, default=Decimal("0.00")
    )
    deadline: Mapped[PyDate | None] = mapped_column(Date, nullable=True)
    is_completed: Mapped[bool] = mapped_column(Boolean, default=False)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc)
    )

    # Relaciones
    user = relationship("User", back_populates="fin_goals")
