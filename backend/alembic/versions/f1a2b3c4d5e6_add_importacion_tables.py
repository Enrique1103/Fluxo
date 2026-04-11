"""add importacion tables

Revision ID: f1a2b3c4d5e6
Revises: c1d2e3f4a5b6
Create Date: 2026-04-01 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'f1a2b3c4d5e6'
down_revision: Union[str, None] = 'c1d2e3f4a5b6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'importaciones',
        sa.Column('id', sa.String(32), nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('fecha', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.Column('archivo', sa.String(255), nullable=True),
        sa.Column('banco', sa.String(50), nullable=True),
        sa.Column('cuenta_id', postgresql.UUID(as_uuid=True), nullable=True),
        sa.Column('total_procesados', sa.Integer(), nullable=False,
                  server_default='0'),
        sa.Column('total_importados', sa.Integer(), nullable=False,
                  server_default='0'),
        sa.Column('total_descartados', sa.Integer(), nullable=False,
                  server_default='0'),
        sa.Column('total_duplicados', sa.Integer(), nullable=False,
                  server_default='0'),
        sa.Column('estado', sa.String(20), nullable=False,
                  server_default='completed'),
        sa.Column('metadata', postgresql.JSON(astext_type=sa.Text()),
                  nullable=True),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.ForeignKeyConstraint(['cuenta_id'], ['accounts.id'],
                                ondelete='SET NULL'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index('ix_importaciones_user_id', 'importaciones', ['user_id'])
    op.create_index('ix_importaciones_fecha', 'importaciones', ['fecha'])

    op.create_table(
        'reglas_categorias',
        sa.Column('id', sa.Integer(), autoincrement=True, nullable=False),
        sa.Column('user_id', postgresql.UUID(as_uuid=True), nullable=False),
        sa.Column('categoria', sa.String(100), nullable=False),
        sa.Column('palabra_clave', sa.String(100), nullable=False),
        sa.Column('confianza', sa.Float(), nullable=False,
                  server_default='0.85'),
        sa.Column('created_at', sa.DateTime(timezone=True), nullable=False,
                  server_default=sa.func.now()),
        sa.ForeignKeyConstraint(['user_id'], ['users.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
        sa.UniqueConstraint('user_id', 'categoria', 'palabra_clave',
                            name='uq_regla_categoria'),
    )

    op.add_column(
        'transactions',
        sa.Column('import_hash', sa.String(16), nullable=True),
    )
    op.create_index('ix_transactions_import_hash', 'transactions',
                    ['import_hash'])


def downgrade() -> None:
    op.drop_index('ix_transactions_import_hash', table_name='transactions')
    op.drop_column('transactions', 'import_hash')
    op.drop_table('reglas_categorias')
    op.drop_index('ix_importaciones_fecha', table_name='importaciones')
    op.drop_index('ix_importaciones_user_id', table_name='importaciones')
    op.drop_table('importaciones')
