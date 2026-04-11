"""create exchange_rates table

Revision ID: a1b2c3d4e5f6
Revises: f6a7b8c9d0e1
Create Date: 2026-03-28 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = "a1b2c3d4e5f6"
down_revision: Union[str, None] = "f6a7b8c9d0e1"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("""
        CREATE TABLE IF NOT EXISTS exchange_rates (
            id UUID PRIMARY KEY,
            user_id UUID NOT NULL REFERENCES users(id),
            from_currency VARCHAR(10) NOT NULL,
            to_currency VARCHAR(10) NOT NULL,
            rate NUMERIC(18, 6) NOT NULL,
            year INTEGER NOT NULL,
            month INTEGER NOT NULL,
            created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
            CONSTRAINT uq_exchange_rate_user_month
                UNIQUE (user_id, from_currency, to_currency, year, month)
        )
    """)
    op.execute("""
        CREATE INDEX IF NOT EXISTS ix_exchange_rates_user_id
        ON exchange_rates (user_id)
    """)


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS ix_exchange_rates_user_id")
    op.execute("DROP TABLE IF EXISTS exchange_rates")
