"""allow any home currency

Revision ID: a1b2c3d4e5f6
Revises: f6a7b8c9d0e1
Create Date: 2026-04-27

"""
from typing import Union
from alembic import op
import sqlalchemy as sa

revision: str = 'b3c4d5e6f7a8'
down_revision: Union[str, None] = 'c2443ed1fe8b'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.drop_constraint('check_user_currency_default', 'users', type_='check')
    op.alter_column('users', 'currency_default',
                    existing_type=sa.CHAR(3),
                    type_=sa.String(10),
                    existing_nullable=False)


def downgrade() -> None:
    op.alter_column('users', 'currency_default',
                    existing_type=sa.String(10),
                    type_=sa.CHAR(3),
                    existing_nullable=False)
    op.create_check_constraint(
        'check_user_currency_default',
        'users',
        "currency_default IN ('UYU', 'USD', 'EUR')",
    )
