"""add instalment plans

Revision ID: a2b3c4d5e6f7
Revises: f1a2b3c4d5e6
Create Date: 2026-04-02 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'a2b3c4d5e6f7'
down_revision: Union[str, None] = 'f1a2b3c4d5e6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'instalment_plans',
        sa.Column('id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('account_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('category_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('concept_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('description', sa.String(100), nullable=True),
        sa.Column('total_amount', sa.Numeric(15, 2), nullable=False),
        sa.Column('n_cuotas', sa.Integer(), nullable=False),
        sa.Column('fecha_inicio', sa.Date(), nullable=False),
        sa.Column(
            'metodo_pago',
            postgresql.ENUM(
                'efectivo', 'tarjeta_credito', 'tarjeta_debito',
                'transferencia_bancaria', 'billetera_digital', 'otro',
                name='paymentmethod',
                create_type=False,
            ),
            nullable=False,
            server_default='tarjeta_credito',
        ),
        sa.Column('is_deleted', sa.Boolean(), nullable=False, server_default='false'),
        sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id']),
        sa.ForeignKeyConstraint(['account_id'], ['accounts.id']),
        sa.ForeignKeyConstraint(['category_id'], ['categories.id']),
        sa.ForeignKeyConstraint(['concept_id'], ['concepts.id']),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_instalment_plans_user_id', 'instalment_plans', ['user_id'])

    op.add_column(
        'transactions',
        sa.Column(
            'instalment_plan_id',
            postgresql.UUID(as_uuid=True),
            sa.ForeignKey('instalment_plans.id', ondelete='SET NULL'),
            nullable=True,
        ),
    )
    op.create_index('ix_transactions_instalment_plan_id', 'transactions', ['instalment_plan_id'])


def downgrade() -> None:
    op.drop_index('ix_transactions_instalment_plan_id', table_name='transactions')
    op.drop_column('transactions', 'instalment_plan_id')
    op.drop_index('ix_instalment_plans_user_id', table_name='instalment_plans')
    op.drop_table('instalment_plans')
