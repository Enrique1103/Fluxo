"""Add transaction_reviews table (F06)

Revision ID: f6a7b8c9e0d1
Revises: d2e3f4a5b6c7
Create Date: 2026-06-06

"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision: str = 'f6a7b8c9e0d1'
down_revision: Union[str, None] = 'd2e3f4a5b6c7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    bind = op.get_bind()

    # Crear ENUMs de forma explícita e idempotente
    postgresql.ENUM(
        'innecesario', 'monto_alto', 'categoria_incorrecta',
        'no_es_del_hogar', 'sospechoso', 'pregunta', 'otra',
        name='reviewtype',
    ).create(bind, checkfirst=True)
    postgresql.ENUM(
        'pendiente', 'respondida', 'descartada', 'resuelta',
        name='reviewstatus',
    ).create(bind, checkfirst=True)

    # postgresql.ENUM con create_type=False evita que _on_table_create los recree
    flag_type_col = postgresql.ENUM(
        'innecesario', 'monto_alto', 'categoria_incorrecta',
        'no_es_del_hogar', 'sospechoso', 'pregunta', 'otra',
        name='reviewtype', create_type=False,
    )
    status_col = postgresql.ENUM(
        'pendiente', 'respondida', 'descartada', 'resuelta',
        name='reviewstatus', create_type=False,
    )

    op.create_table(
        'transaction_reviews',
        sa.Column('id',                 postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('transaction_id',     postgresql.UUID(as_uuid=True), sa.ForeignKey('transactions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('household_id',       postgresql.UUID(as_uuid=True), sa.ForeignKey('households.id',   ondelete='CASCADE'), nullable=False),
        sa.Column('flagged_by_user_id', postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'),        nullable=False),
        sa.Column('flag_type',          flag_type_col,  nullable=False),
        sa.Column('comment',            sa.String(500), nullable=True),
        sa.Column('status',             status_col,     nullable=False, server_default='pendiente'),
        sa.Column('created_at',         sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
        sa.Column('response_comment',   sa.String(500), nullable=True),
        sa.Column('response_at',        sa.DateTime(timezone=True), nullable=True),
    )
    op.create_index('ix_reviews_transaction', 'transaction_reviews', ['transaction_id'])
    op.create_index('ix_reviews_household',   'transaction_reviews', ['household_id'])
    op.create_index('ix_reviews_status',      'transaction_reviews', ['status'])


def downgrade() -> None:
    op.drop_index('ix_reviews_status',      table_name='transaction_reviews')
    op.drop_index('ix_reviews_household',   table_name='transaction_reviews')
    op.drop_index('ix_reviews_transaction', table_name='transaction_reviews')
    op.drop_table('transaction_reviews')
    op.execute("DROP TYPE IF EXISTS reviewstatus")
    op.execute("DROP TYPE IF EXISTS reviewtype")
