"""add transaction_history (trazabilidad de movimientos)

Revision ID: h1i2j3k4l5m6
Revises: g1h2i3j4k5l6
Create Date: 2026-10-10

Solo agrega una tabla nueva; no modifica ni borra datos existentes.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'h1i2j3k4l5m6'
down_revision = 'g1h2i3j4k5l6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'transaction_history',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('transaction_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('transactions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('action', sa.String(10), nullable=False),
        sa.Column('snapshot', sa.JSON(), nullable=False),
        sa.Column('changes', sa.JSON(), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_tx_history_transaction', 'transaction_history', ['transaction_id'])
    op.create_index('ix_tx_history_user_created', 'transaction_history', ['user_id', 'created_at'])


def downgrade() -> None:
    op.drop_index('ix_tx_history_user_created', table_name='transaction_history')
    op.drop_index('ix_tx_history_transaction', table_name='transaction_history')
    op.drop_table('transaction_history')
