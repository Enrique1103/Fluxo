"""add revoked_tokens table

Revision ID: c3b0f8d4e9a2
Revises: 87a5e3655cd7
Create Date: 2026-03-25 20:30:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3b0f8d4e9a2'
down_revision: Union[str, Sequence[str], None] = '87a5e3655cd7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    conn = op.get_bind()
    from sqlalchemy import inspect
    if not inspect(conn).has_table('revoked_tokens'):
        op.create_table(
            'revoked_tokens',
            sa.Column('id', sa.UUID(), nullable=False),
            sa.Column('token', sa.String(), nullable=False),
            sa.Column('revoked_at', sa.DateTime(timezone=True), nullable=False),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(
            op.f('ix_revoked_tokens_token'),
            'revoked_tokens', ['token'],
            unique=True,
        )


def downgrade() -> None:
    op.drop_index(op.f('ix_revoked_tokens_token'), table_name='revoked_tokens')
    op.drop_table('revoked_tokens')
