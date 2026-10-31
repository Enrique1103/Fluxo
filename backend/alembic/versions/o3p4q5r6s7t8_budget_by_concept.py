"""Presupuestos por categoría o por concepto

Revision ID: o3p4q5r6s7t8
Revises: n2o3p4q5r6s7
Create Date: 2026-10-31

Agrega budgets.concept_id (opcional). Los presupuestos existentes quedan con
concept_id NULL, o sea siguen siendo de la categoría entera: no cambia ningún dato.
La restricción de unicidad pasa a ser dos índices parciales (uno para presupuestos
de categoría y otro para presupuestos de concepto).
"""
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'o3p4q5r6s7t8'
down_revision = 'n2o3p4q5r6s7'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column('budgets', sa.Column('concept_id', postgresql.UUID(as_uuid=True), nullable=True))
    op.create_foreign_key('budgets_concept_id_fkey', 'budgets', 'concepts',
                          ['concept_id'], ['id'], ondelete='CASCADE')
    # IF EXISTS: por si la tabla de producción se creó sin esa restricción con ese nombre
    op.execute("ALTER TABLE budgets DROP CONSTRAINT IF EXISTS uq_budget_user_cat_period")
    op.execute("DROP INDEX IF EXISTS uq_budget_user_cat_period")
    op.create_index('uq_budget_user_cat_period', 'budgets',
                    ['user_id', 'category_id', 'month', 'year', 'currency'], unique=True,
                    postgresql_where=sa.text('concept_id IS NULL'))
    op.create_index('uq_budget_user_concept_period', 'budgets',
                    ['user_id', 'concept_id', 'month', 'year', 'currency'], unique=True,
                    postgresql_where=sa.text('concept_id IS NOT NULL'))


def downgrade() -> None:
    op.execute("DELETE FROM budgets WHERE concept_id IS NOT NULL")
    op.drop_index('uq_budget_user_concept_period', table_name='budgets')
    op.drop_index('uq_budget_user_cat_period', table_name='budgets')
    op.create_unique_constraint('uq_budget_user_cat_period', 'budgets',
                                ['user_id', 'category_id', 'month', 'year', 'currency'])
    op.drop_constraint('budgets_concept_id_fkey', 'budgets', type_='foreignkey')
    op.drop_column('budgets', 'concept_id')
