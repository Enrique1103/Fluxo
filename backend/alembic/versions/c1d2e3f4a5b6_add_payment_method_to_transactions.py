"""add metodo_pago to transactions

Revision ID: c1d2e3f4a5b6
Revises: b2c3d4e5f6a7
Create Date: 2026-03-31 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision: str = 'c1d2e3f4a5b6'
down_revision: Union[str, None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

PAYMENT_METHOD_ENUM = 'paymentmethod'
PAYMENT_METHOD_VALUES = (
    'efectivo',
    'tarjeta_credito',
    'tarjeta_debito',
    'transferencia_bancaria',
    'billetera_digital',
    'otro',
)


def upgrade() -> None:
    # Crear el tipo ENUM en PostgreSQL
    payment_method_enum = postgresql.ENUM(
        *PAYMENT_METHOD_VALUES,
        name=PAYMENT_METHOD_ENUM,
        create_type=True,
    )
    payment_method_enum.create(op.get_bind(), checkfirst=True)

    # Agregar metodo_pago con server_default='otro' para retrocompatibilidad
    op.add_column(
        'transactions',
        sa.Column(
            'metodo_pago',
            sa.Enum(*PAYMENT_METHOD_VALUES, name=PAYMENT_METHOD_ENUM, create_type=False),
            nullable=False,
            server_default='otro',
        ),
    )

    # Quitar el server_default una vez hecho el backfill
    op.alter_column('transactions', 'metodo_pago', server_default=None)


def downgrade() -> None:
    op.drop_column('transactions', 'metodo_pago')
    op.execute(f'DROP TYPE IF EXISTS {PAYMENT_METHOD_ENUM}')
