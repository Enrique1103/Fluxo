import uuid
from datetime import date as PyDate, datetime, timezone
from decimal import Decimal
from enum import Enum
from sqlalchemy import String, Boolean, Date, DateTime, Numeric, ForeignKey, CheckConstraint, Index
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class TransactionType(str, Enum):
    INCOME = "income"
    EXPENSE = "expense"
    TRANSFER = "transfer"


class TransferRole(str, Enum):
    SOURCE = "source"
    DESTINATION = "destination"


class PaymentMethod(str, Enum):
    EFECTIVO = "efectivo"
    TARJETA_CREDITO = "tarjeta_credito"
    TARJETA_DEBITO = "tarjeta_debito"
    TRANSFERENCIA_BANCARIA = "transferencia_bancaria"
    BILLETERA_DIGITAL = "billetera_digital"
    OTRO = "otro"


class Transaction(Base):
    __tablename__ = "transactions"
    __table_args__ = (
        CheckConstraint("amount > 0", name="check_transaction_amount_positive"),
    )

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
    amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    type: Mapped[TransactionType] = mapped_column(SQLEnum(TransactionType), nullable=False)
    date: Mapped[PyDate] = mapped_column(Date, nullable=False)
    description: Mapped[str | None] = mapped_column(String(100), nullable=True, default=None)
    transfer_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("transactions.id", ondelete="SET NULL"),
        nullable=True
    )
    transfer_role: Mapped[TransferRole | None] = mapped_column(
        SQLEnum(TransferRole), nullable=True
    )
    external_account_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("external_accounts.id", ondelete="SET NULL"), nullable=True
    )
    metodo_pago: Mapped[PaymentMethod] = mapped_column(
        SQLEnum(PaymentMethod, values_callable=lambda x: [e.value for e in x]),
        nullable=False,
        default=PaymentMethod.OTRO,
    )
    instalment_plan_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("instalment_plans.id", ondelete="SET NULL"), nullable=True
    )
    household_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("households.id", ondelete="SET NULL"), nullable=True
    )
    commission: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True, default=None)
    import_hash: Mapped[str | None] = mapped_column(String(16), nullable=True, default=None)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc)
    )

    # Relaciones
    user = relationship("User", back_populates="transactions")
    account = relationship("Account", back_populates="transactions")
    category = relationship("Category", back_populates="transactions")
    concept = relationship("Concept", back_populates="transactions")
    transfer_pair: Mapped["Transaction | None"] = relationship(
        "Transaction",
        primaryjoin="Transaction.transfer_id == Transaction.id",
        foreign_keys="[Transaction.transfer_id]",
        uselist=False
    )
    external_account = relationship("ExternalAccount")
    household        = relationship("Household", back_populates="transactions")
