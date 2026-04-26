"""add category_id to concepts

Revision ID: c2443ed1fe8b
Revises: 6d7e49ad28c9
Create Date: 2026-04-26 14:50:33.212954

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c2443ed1fe8b'
down_revision: Union[str, Sequence[str], None] = '6d7e49ad28c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column('concepts', sa.Column('category_id', sa.UUID(), nullable=True))
    op.create_foreign_key('fk_concepts_category_id', 'concepts', 'categories', ['category_id'], ['id'])

    # Populate from most-used category per concept in transaction history
    op.execute("""
        UPDATE concepts c
        SET category_id = (
            SELECT t.category_id
            FROM transactions t
            WHERE t.concept_id = c.id
              AND t.is_deleted = FALSE
            GROUP BY t.category_id
            ORDER BY COUNT(*) DESC
            LIMIT 1
        )
        WHERE c.category_id IS NULL
    """)


def downgrade() -> None:
    op.drop_constraint('fk_concepts_category_id', 'concepts', type_='foreignkey')
    op.drop_column('concepts', 'category_id')
