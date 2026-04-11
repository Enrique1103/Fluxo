"""remove goal_source and account_id from fin_goals

Revision ID: f6a7b8c9d0e1
Revises: e5f6a7b8c9d0
Create Date: 2026-03-28 00:00:00.000000

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'f6a7b8c9d0e1'
down_revision: Union[str, None] = '8091b77d7f99'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.drop_column('fin_goals', 'goal_source')
    op.drop_column('fin_goals', 'account_id')


def downgrade() -> None:
    op.add_column('fin_goals', sa.Column(
        'account_id',
        postgresql.UUID(as_uuid=True),
        sa.ForeignKey('accounts.id'),
        nullable=True,
    ))
    op.add_column('fin_goals', sa.Column(
        'goal_source',
        sa.Enum('liquidity', 'fixed_account', name='goalsource'),
        nullable=False,
        server_default='liquidity',
    ))
