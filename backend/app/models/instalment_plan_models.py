import uuid
from datetime import date as PyDate, datetime, timezone
from decimal import Decimal
from sqlalchemy import String, Boolean, Date, DateTime, Integer, Numeric, ForeignKey
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base
from .transactions_models import PaymentMethod


class InstalmentPlan(Base):
    __tablename__ = "instalment_plans"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    account_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.id"), nullable=False
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id"), nullable=False
    )
    concept_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("concepts.id"), nullable=False
    )
    description: Mapped[str | None] = mapped_column(String(100), nullable=True, default=None)
    total_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    n_cuotas: Mapped[int] = mapped_column(Integer, nullable=False)
    fecha_inicio: Mapped[PyDate] = mapped_column(Date, nullable=False)
    metodo_pago: Mapped[PaymentMethod] = mapped_column(
        SQLEnum(PaymentMethod, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=PaymentMethod.TARJETA_CREDITO,
    )
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc)
    )

    # Relaciones
    user = relationship("User")
    account = relationship("Account")
    category = relationship("Category")
    concept = relationship("Concept")
    cuotas = relationship(
        "Transaction",
        primaryjoin="InstalmentPlan.id == foreign(Transaction.instalment_plan_id)",
        uselist=True,
    )
