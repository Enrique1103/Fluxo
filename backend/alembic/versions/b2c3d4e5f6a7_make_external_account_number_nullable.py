"""make external account_number nullable

Revision ID: b2c3d4e5f6a7
Revises: a1b2c3d4e5f6
Create Date: 2026-03-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('external_accounts', 'account_number',
                    existing_type=sa.String(length=50),
                    nullable=True)


def downgrade() -> None:
    # Fill nulls before restoring NOT NULL
    op.execute("UPDATE external_accounts SET account_number = '' WHERE account_number IS NULL")
    op.alter_column('external_accounts', 'account_number',
                    existing_type=sa.String(length=50),
                    nullable=False)
