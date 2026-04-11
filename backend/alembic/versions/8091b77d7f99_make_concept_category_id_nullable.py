"""make concept category_id nullable

Revision ID: 8091b77d7f99
Revises: e5f6a7b8c9d0
Create Date: 2026-03-27 19:40:34.379637

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8091b77d7f99'
down_revision: Union[str, Sequence[str], None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.alter_column('concepts', 'category_id',
               existing_type=sa.UUID(),
               nullable=True)


def downgrade() -> None:
    op.alter_column('concepts', 'category_id',
               existing_type=sa.UUID(),
               nullable=False)
