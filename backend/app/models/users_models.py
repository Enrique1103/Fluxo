import uuid
from datetime import datetime, timezone
from sqlalchemy import String, Boolean, DateTime, Text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=False, unique=True, index=True)
    password_hash: Mapped[str] = mapped_column(Text, nullable=False)
    currency_default: Mapped[str] = mapped_column(String(10), nullable=False, default="UYU")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc)
    )

    # Relaciones
    accounts = relationship("Account", back_populates="user", cascade="all, delete-orphan")
    transactions = relationship("Transaction", back_populates="user")
    categories = relationship("Category", back_populates="user", cascade="all, delete-orphan")
    concepts = relationship("Concept", back_populates="user", cascade="all, delete-orphan")
    fin_goals = relationship("FinGoal", back_populates="user", cascade="all, delete-orphan")
    exchange_rates = relationship("ExchangeRate", back_populates="user", cascade="all, delete-orphan")
    importaciones = relationship("Importacion", back_populates="user", cascade="all, delete-orphan")
