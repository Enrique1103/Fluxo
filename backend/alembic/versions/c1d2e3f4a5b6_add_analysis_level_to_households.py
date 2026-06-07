"""Add analysis_level to households

Revision ID: c1d2e3f4a5b6
Revises: b9c0d1e2f3a4
Create Date: 2026-06-06

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa


revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, None] = 'b9c0d1e2f3a4'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Crear el tipo enum en PostgreSQL (idempotente)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'analysislevel') THEN
                CREATE TYPE analysislevel AS ENUM ('expenses_only', 'expenses_and_goals', 'full');
            END IF;
        END$$;
    """)

    op.add_column('households', sa.Column(
        'analysis_level',
        sa.Enum('expenses_only', 'expenses_and_goals', 'full', name='analysislevel'),
        nullable=False,
        server_default='expenses_only',
    ))


def downgrade() -> None:
    op.drop_column('households', 'analysis_level')
    op.execute("DROP TYPE IF EXISTS analysislevel")
