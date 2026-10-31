"""Presupuestos de varias categorías juntas

Revision ID: p4q5r6s7t8u9
Revises: o3p4q5r6s7t8
Create Date: 2026-10-31

Nueva tabla budget_categories con las categorías adicionales de un presupuesto
agrupado (la primera sigue en budgets.category_id) y budgets.name opcional.
El índice único de presupuestos de categoría pasa a ser un índice común: los
duplicados se controlan en el servicio comparando el conjunto de categorías.
No cambia ningún dato existente.
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'p4q5r6s7t8u9'
down_revision = 'o3p4q5r6s7t8'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        'budget_categories',
        sa.Column('budget_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('budgets.id', ondelete='CASCADE'), primary_key=True),
        sa.Column('category_id', postgresql.UUID(as_uuid=True),
                  sa.ForeignKey('categories.id', ondelete='CASCADE'), primary_key=True),
    )
    op.add_column('budgets', sa.Column('name', sa.String(length=60), nullable=True))
    op.execute("DROP INDEX IF EXISTS uq_budget_user_cat_period")
    op.create_index('ix_budget_user_cat_period', 'budgets',
                    ['user_id', 'category_id', 'month', 'year', 'currency'])


def downgrade() -> None:
    # Los agrupados vuelven a ser de su primera categoría; si eso deja duplicados, se borran
    op.drop_table('budget_categories')
    op.execute("""
        DELETE FROM budgets b USING budgets o
        WHERE b.concept_id IS NULL AND o.concept_id IS NULL AND b.id > o.id
          AND b.user_id = o.user_id AND b.category_id = o.category_id
          AND b.month = o.month AND b.year = o.year AND b.currency = o.currency
    """)
    op.drop_index('ix_budget_user_cat_period', table_name='budgets')
    op.create_index('uq_budget_user_cat_period', 'budgets',
                    ['user_id', 'category_id', 'month', 'year', 'currency'], unique=True,
                    postgresql_where=sa.text('concept_id IS NULL'))
    op.drop_column('budgets', 'name')
