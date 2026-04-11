import uuid
from datetime import datetime, timezone
from sqlalchemy import Column, String, Integer, DateTime, Float, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSON
from sqlalchemy.orm import relationship, Mapped, mapped_column
from .base import Base


class Importacion(Base):
    __tablename__ = "importaciones"

    id: Mapped[str] = mapped_column(
        String(32), primary_key=True,
        default=lambda: uuid.uuid4().hex[:12]
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False
    )
    fecha: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )
    archivo: Mapped[str | None] = mapped_column(String(255), nullable=True)
    banco: Mapped[str | None] = mapped_column(String(50), nullable=True)
    cuenta_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True), ForeignKey("accounts.id", ondelete="SET NULL"),
        nullable=True
    )
    total_procesados: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_importados: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_descartados: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    total_duplicados: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    estado: Mapped[str] = mapped_column(String(20), nullable=False, default="completed")
    metadata_: Mapped[dict | None] = mapped_column("metadata", JSON, nullable=True)

    user = relationship("User", back_populates="importaciones")
    account = relationship("Account")


class ReglaCategorias(Base):
    __tablename__ = "reglas_categorias"
    __table_args__ = (
        UniqueConstraint("user_id", "categoria", "palabra_clave",
                         name="uq_regla_categoria"),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"),
        nullable=False
    )
    categoria: Mapped[str] = mapped_column(String(100), nullable=False)
    palabra_clave: Mapped[str] = mapped_column(String(100), nullable=False)
    confianza: Mapped[float] = mapped_column(Float, nullable=False, default=0.85)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), nullable=False,
        default=lambda: datetime.now(timezone.utc)
    )

    user = relationship("User")
