"""add monthly_totals (importación de totales mensuales)

Revision ID: i1j2k3l4m5n6
Revises: g1h2i3j4k5l6
Create Date: 2026-10-10

Solo agrega una tabla nueva; no modifica ni borra datos existentes.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'i1j2k3l4m5n6'
down_revision = 'g1h2i3j4k5l6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'monthly_totals',
        sa.Column('id', postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column('user_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=False),
        sa.Column('year', sa.Integer(), nullable=False),
        sa.Column('month', sa.Integer(), nullable=False),
        sa.Column('currency', sa.String(10), nullable=False),
        sa.Column('income', sa.Numeric(15, 2), nullable=False, server_default='0'),
        sa.Column('expense', sa.Numeric(15, 2), nullable=False, server_default='0'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('updated_at', sa.DateTime(timezone=True), nullable=True),
        sa.UniqueConstraint('user_id', 'year', 'month', 'currency', name='uq_monthly_total_user_month_currency'),
        sa.CheckConstraint('month BETWEEN 1 AND 12', name='check_monthly_total_month'),
        sa.CheckConstraint('income >= 0 AND expense >= 0', name='check_monthly_total_non_negative'),
    )


def downgrade() -> None:
    op.drop_table('monthly_totals')
