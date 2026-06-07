"""Add budgets table

Revision ID: c5d6e7f8a9b0
Revises: f6a7b8c9e0d1
Create Date: 2026-06-07

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'c5d6e7f8a9b0'
down_revision: Union[str, None] = 'f6a7b8c9e0d1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'budgets',
        sa.Column('id',          postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('user_id',     postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id',      ondelete='CASCADE'), nullable=False),
        sa.Column('category_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('categories.id', ondelete='CASCADE'), nullable=False),
        sa.Column('month',       sa.Integer,     nullable=False),
        sa.Column('year',        sa.Integer,     nullable=False),
        sa.Column('max_amount',  sa.Numeric(15, 2), nullable=False),
        sa.Column('currency',    sa.String(10),  nullable=False),
        sa.Column('created_at',  sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.UniqueConstraint('user_id', 'category_id', 'month', 'year', 'currency', name='uq_budget_user_cat_period'),
        sa.CheckConstraint('max_amount > 0',        name='check_budget_positive'),
        sa.CheckConstraint('month BETWEEN 1 AND 12', name='check_budget_month'),
        sa.CheckConstraint('year >= 2000',           name='check_budget_year'),
    )
    op.create_index('ix_budgets_user_period', 'budgets', ['user_id', 'year', 'month'])


def downgrade() -> None:
    op.drop_index('ix_budgets_user_period', table_name='budgets')
    op.drop_table('budgets')
