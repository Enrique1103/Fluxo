"""member_transfers

Revision ID: q5r6s7t8u9v0
Revises: p4q5r6s7t8u9
Create Date: 2026-11-01
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "q5r6s7t8u9v0"
down_revision = "p4q5r6s7t8u9"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "member_transfers",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("household_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("households.id", ondelete="CASCADE"), nullable=False, index=True),
        sa.Column("from_user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("to_user_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("users.id"), nullable=False),
        sa.Column("amount", sa.Numeric(15, 2), nullable=False),
        sa.Column("currency", sa.String(3), nullable=False),
        sa.Column("date", sa.Date, nullable=False),
        sa.Column("description", sa.String(200), nullable=True),
        sa.Column("from_tx_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("to_tx_id", postgresql.UUID(as_uuid=True),
                  sa.ForeignKey("transactions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("member_transfers")
