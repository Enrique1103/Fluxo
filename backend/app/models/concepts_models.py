import uuid
from sqlalchemy import Boolean, String, Integer, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy import ForeignKey
from .base import Base


class Concept(Base):
    __tablename__ = "concepts"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="uq_concept_user_name"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id"), nullable=False
    )
    # Todo concepto pertenece a una categoría: al registrar un movimiento se elige
    # el concepto y la categoría sale de acá.
    category_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("categories.id"), nullable=False
    )
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    frequency_score: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    is_system: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    # Relaciones
    user = relationship("User", back_populates="concepts")
    category = relationship("Category", foreign_keys=[category_id], back_populates="concepts")
    transactions = relationship("Transaction", back_populates="concept")
