"""add external accounts

Revision ID: d4e5f6a7b8c9
Revises: c3b0f8d4e9a2
Create Date: 2026-03-25 21:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'd4e5f6a7b8c9'
down_revision: Union[str, Sequence[str], None] = 'c3b0f8d4e9a2'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'external_accounts',
        sa.Column('id', sa.UUID(), nullable=False),
        sa.Column('user_id', sa.UUID(), nullable=False),
        sa.Column('name', sa.String(length=100), nullable=False),
        sa.Column('account_number', sa.String(length=50), nullable=True),
        sa.Column('owner_name', sa.String(length=100), nullable=False),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.add_column(
        'transactions',
        sa.Column('external_account_id', sa.UUID(), nullable=True)
    )
    op.create_foreign_key(
        'fk_transactions_external_account',
        'transactions', 'external_accounts',
        ['external_account_id'], ['id'],
        ondelete='SET NULL',
    )


def downgrade() -> None:
    op.drop_constraint('fk_transactions_external_account', 'transactions', type_='foreignkey')
    op.drop_column('transactions', 'external_account_id')
    op.drop_table('external_accounts')
