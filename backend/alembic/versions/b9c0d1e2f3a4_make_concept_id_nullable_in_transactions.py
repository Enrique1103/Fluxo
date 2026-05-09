"""make concept_id nullable in transactions

Revision ID: b9c0d1e2f3a4
Revises: 3f6dde3ff6a0
Create Date: 2026-05-09

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'b9c0d1e2f3a4'
down_revision: Union[str, Sequence[str], None] = '3f6dde3ff6a0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('transactions', 'concept_id', existing_type=sa.UUID(), nullable=True)


def downgrade() -> None:
    op.alter_column('transactions', 'concept_id', existing_type=sa.UUID(), nullable=False)
