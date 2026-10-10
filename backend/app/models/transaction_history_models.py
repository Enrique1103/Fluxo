import uuid
from datetime import datetime, timezone
from sqlalchemy import String, DateTime, ForeignKey, Index, JSON
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from .base import Base


class TransactionHistory(Base):
    """
    Registro inmutable de cada alta, edición o borrado de un movimiento (trazabilidad).
    `snapshot` es el estado del movimiento después de la acción (antes, si es un borrado);
    `changes` es {campo: [valor_anterior, valor_nuevo]} solo para ediciones.
    """
    __tablename__ = "transaction_history"
    __table_args__ = (
        Index("ix_tx_history_transaction", "transaction_id"),
        Index("ix_tx_history_user_created", "user_id", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), primary_key=True, default=uuid.uuid4
    )
    transaction_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("transactions.id", ondelete="CASCADE"), nullable=False
    )
    user_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True), ForeignKey("users.id", ondelete="CASCADE"), nullable=False
    )
    action: Mapped[str] = mapped_column(String(10), nullable=False)  # create | update | delete
    snapshot: Mapped[dict] = mapped_column(JSON, nullable=False)
    changes: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), default=lambda: datetime.now(timezone.utc)
    )
