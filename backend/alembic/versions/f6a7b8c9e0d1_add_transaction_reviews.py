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
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reviewtype') THEN
                CREATE TYPE reviewtype AS ENUM (
                    'innecesario', 'monto_alto', 'categoria_incorrecta',
                    'no_es_del_hogar', 'sospechoso', 'pregunta', 'otra'
                );
            END IF;
        END$$;
    """)
    op.execute("""
        DO $$
        BEGIN
            IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'reviewstatus') THEN
                CREATE TYPE reviewstatus AS ENUM (
                    'pendiente', 'respondida', 'descartada', 'resuelta'
                );
            END IF;
        END$$;
    """)

    op.create_table(
        'transaction_reviews',
        sa.Column('id',                  postgresql.UUID(as_uuid=True), primary_key=True, nullable=False),
        sa.Column('transaction_id',      postgresql.UUID(as_uuid=True), sa.ForeignKey('transactions.id', ondelete='CASCADE'), nullable=False),
        sa.Column('household_id',        postgresql.UUID(as_uuid=True), sa.ForeignKey('households.id',   ondelete='CASCADE'), nullable=False),
        sa.Column('flagged_by_user_id',  postgresql.UUID(as_uuid=True), sa.ForeignKey('users.id'),        nullable=False),
        sa.Column('flag_type',           sa.Enum(name='reviewtype'),   nullable=False),
        sa.Column('comment',             sa.String(500),                nullable=True),
        sa.Column('status',              sa.Enum(name='reviewstatus'), nullable=False, server_default='pendiente'),
        sa.Column('created_at',          sa.DateTime(timezone=True),   server_default=sa.func.now(), nullable=False),
        sa.Column('response_comment',    sa.String(500),                nullable=True),
        sa.Column('response_at',         sa.DateTime(timezone=True),   nullable=True),
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
