import uuid
from sqlalchemy import String, Boolean, CHAR, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from .base import Base


# Para qué tipo de movimiento se usan los conceptos de la categoría.
# Se guarda como texto (no ENUM de Postgres) para poder sumar valores sin migrar el tipo.
CATEGORY_KINDS = ("expense", "income", "transfer", "any")
TX_TYPE_TO_KINDS = {
    "expense":  ("expense", "any"),
    "income":   ("income", "any"),
    "transfer": ("transfer", "any"),
}


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_category_user_name"),
        UniqueConstraint("user_id", "slug", name="uq_category_user_slug"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(50), nullable=False)
    slug: Mapped[str] = mapped_column(String(60), nullable=False)
    icon: Mapped[str | None] = mapped_column(String(50), nullable=True)
    color: Mapped[str | None] = mapped_column(CHAR(7), nullable=True)
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)
    # expense | income | transfer | any — filtra qué conceptos se ofrecen según el tipo de movimiento
    kind: Mapped[str] = mapped_column(
        String(10), nullable=False, default="expense", server_default="expense"
    )

    # Relaciones
    user = relationship("User", back_populates="categories")
    transactions = relationship("Transaction", back_populates="category")
    concepts = relationship("Concept", back_populates="category")
    budgets = relationship("Budget", back_populates="category", cascade="all, delete-orphan")
