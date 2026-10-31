"""categories.kind admite combinaciones de dos tipos (ej: "expense,income")

Revision ID: n2o3p4q5r6s7
Revises: m1n2o3p4q5r6
Create Date: 2026-10-31

Solo agranda la columna (10 → 30 caracteres). No cambia ningún dato.
"""
from alembic import op
import sqlalchemy as sa

revision = 'n2o3p4q5r6s7'
down_revision = 'm1n2o3p4q5r6'
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.alter_column('categories', 'kind', type_=sa.String(length=30), existing_type=sa.String(length=10),
                    existing_nullable=False, existing_server_default='expense')


def downgrade() -> None:
    # Las combinaciones no entran en 10 caracteres: pasan a "any" antes de achicar
    op.execute("UPDATE categories SET kind = 'any' WHERE kind LIKE '%,%'")
    op.alter_column('categories', 'kind', type_=sa.String(length=10), existing_type=sa.String(length=30),
                    existing_nullable=False, existing_server_default='expense')
