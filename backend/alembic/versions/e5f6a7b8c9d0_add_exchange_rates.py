"""add exchange rates

Revision ID: e5f6a7b8c9d0
Revises: d4e5f6a7b8c9
Create Date: 2026-03-27 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "e5f6a7b8c9d0"
down_revision: Union[str, None] = "d4e5f6a7b8c9"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "exchange_rates",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", postgresql.UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False),
        sa.Column("from_currency", sa.String(10), nullable=False),
        sa.Column("to_currency", sa.String(10), nullable=False),
        sa.Column("rate", sa.Numeric(18, 6), nullable=False),
        sa.Column("year", sa.Integer, nullable=False),
        sa.Column("month", sa.Integer, nullable=False),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.UniqueConstraint(
            "user_id", "from_currency", "to_currency", "year", "month",
            name="uq_exchange_rate_user_month",
        ),
    )
    op.create_index("ix_exchange_rates_user_id", "exchange_rates", ["user_id"])


def downgrade() -> None:
    op.drop_index("ix_exchange_rates_user_id", table_name="exchange_rates")
    op.drop_table("exchange_rates")
