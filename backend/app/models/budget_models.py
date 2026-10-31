import uuid
from datetime import datetime, timezone
from decimal import Decimal
from sqlalchemy import String, DateTime, Numeric, ForeignKey, Integer, Index, CheckConstraint, text
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


class Budget(Base):
    __tablename__ = "budgets"
    __table_args__ = (
        # Un presupuesto puede ser de una o varias categorías enteras (concept_id NULL: suma
        # todos sus conceptos) o de un concepto puntual. Los de categoría se controlan contra
        # duplicados en el servicio (comparando el conjunto de categorías), no con un índice único.
        Index("ix_budget_user_cat_period", "user_id", "category_id", "month", "year", "currency"),
        Index("uq_budget_user_concept_period", "user_id", "concept_id", "month", "year", "currency",
              unique=True,
              postgresql_where=text("concept_id IS NOT NULL"), sqlite_where=text("concept_id IS NOT NULL")),
        CheckConstraint("max_amount > 0", name="check_budget_positive"),
        CheckConstraint("month BETWEEN 1 AND 12", name="check_budget_month"),
        CheckConstraint("year >= 2000", name="check_budget_year"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id", ondelete="CASCADE"), nullable=False
    )
    # NULL = presupuesto de toda la categoría. Con valor = solo ese concepto.
    concept_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("concepts.id", ondelete="CASCADE"), nullable=True
    )
    month: Mapped[int] = mapped_column(Integer, nullable=False)
    year: Mapped[int] = mapped_column(Integer, nullable=False)
    max_amount: Mapped[Decimal] = mapped_column(Numeric(15, 2), nullable=False)
    currency: Mapped[str] = mapped_column(String(10), nullable=False)
    # Nombre opcional para un presupuesto de varias categorías (ej: "Casa y comida")
    name: Mapped[str | None] = mapped_column(String(60), nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc)
    )

    user     = relationship("User",     back_populates="budgets")
    category = relationship("Category", back_populates="budgets")
    concept  = relationship("Concept")
    # Categorías adicionales de un presupuesto agrupado (ej: Alimentación + Hogar).
    # category_id es la primera; acá van las demás.
    extra_categories = relationship("BudgetCategory", cascade="all, delete-orphan", lazy="selectin")

    @property
    def category_ids(self) -> list[uuid.UUID]:
        return [self.category_id] + [x.category_id for x in self.extra_categories]


class BudgetCategory(Base):
    __tablename__ = "budget_categories"

    budget_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("budgets.id", ondelete="CASCADE"), primary_key=True
    )
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id", ondelete="CASCADE"), primary_key=True
    )
