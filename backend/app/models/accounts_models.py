import uuid
from datetime import datetime
from decimal import Decimal
from enum import Enum
from sqlalchemy import String, Boolean, DateTime, Numeric, ForeignKey
from sqlalchemy import Enum as SQLEnum
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class AccountType(str, Enum):
    CASH = "cash"
    DEBIT = "debit"
    CREDIT = "credit"
    INVESTMENT = "investment"


class CurrencyCode(str, Enum):
    UYU = "UYU"
    USD = "USD"
    EUR = "EUR"


class Account(Base):
    __tablename__ = "accounts"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    type: Mapped[AccountType] = mapped_column(SQLEnum(AccountType), nullable=False)
    currency: Mapped[CurrencyCode] = mapped_column(SQLEnum(CurrencyCode), nullable=False)
    balance: Mapped[Decimal] = mapped_column(
        Numeric(15, 2), nullable=False, default=Decimal("0.00")
    )
    credit_limit: Mapped[Decimal | None] = mapped_column(Numeric(15, 2), nullable=True)
    is_deleted: Mapped[bool] = mapped_column(Boolean, default=False)
    deleted_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)

    @property
    def is_liability(self) -> bool:
        return self.type == AccountType.CREDIT

    # Relaciones
    user = relationship("User", back_populates="accounts")
    transactions = relationship("Transaction", back_populates="account")
