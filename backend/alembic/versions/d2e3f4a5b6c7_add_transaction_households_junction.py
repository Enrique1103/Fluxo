"""Add transaction_households junction table (F04)

Revision ID: d2e3f4a5b6c7
Revises: c1d2e3f4a5b6
Create Date: 2026-06-06

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'd2e3f4a5b6c7'
down_revision: Union[str, None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'transaction_households',
        sa.Column('transaction_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('transactions.id', ondelete='CASCADE'),
                  primary_key=True, nullable=False),
        sa.Column('household_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('households.id', ondelete='CASCADE'),
                  primary_key=True, nullable=False),
        sa.Column('added_at', sa.DateTime(timezone=True),
                  server_default=sa.func.now(), nullable=False),
    )

    # Migrar datos existentes: cada tx con household_id != NULL
    op.execute("""
        INSERT INTO transaction_households (transaction_id, household_id, added_at)
        SELECT id, household_id, COALESCE(created_at, NOW())
        FROM transactions
        WHERE household_id IS NOT NULL
        ON CONFLICT DO NOTHING
    """)


def downgrade() -> None:
    op.drop_table('transaction_households')
