"""reintegros y pagos del balanceo del hogar

Revision ID: l1m2n3o4p5q6
Revises: k1l2m3n4o5p6
Create Date: 2026-10-31

- concepts.is_refund y transactions.is_refund (default false): un reintegro se
  carga como ingreso pero resta del gasto de su categoría.
- household_settlements: pagos del balanceo mensual del hogar.
Solo agrega columnas/tablas con valores por defecto; no modifica datos existentes.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'l1m2n3o4p5q6'
down_revision = 'k1l2m3n4o5p6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('concepts', sa.Column('is_refund', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.add_column('transactions', sa.Column('is_refund', sa.Boolean(), nullable=False, server_default=sa.false()))
    op.create_table(
        'household_settlements',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('household_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('households.id', ondelete='CASCADE'), nullable=False),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('month', sa.Integer(), nullable=False),
        sa.Column('from_user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('to_user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'), nullable=False),
        sa.Column('amount', sa.Numeric(15, 2), nullable=False),
        sa.Column('currency', sa.String(length=3), nullable=False),
        sa.Column('paid_date', sa.Date(), nullable=False),
        sa.Column('comment', sa.String(length=100), nullable=True),
        sa.Column('payer_tx_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('transactions.id', ondelete='SET NULL'), nullable=True),
        sa.Column('receiver_tx_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('transactions.id', ondelete='SET NULL'), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_household_settlements_household_id', 'household_settlements', ['household_id'])


def downgrade() -> None:
    op.drop_index('ix_household_settlements_household_id', table_name='household_settlements')
    op.drop_table('household_settlements')
    op.drop_column('transactions', 'is_refund')
    op.drop_column('concepts', 'is_refund')
