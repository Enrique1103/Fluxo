"""concepto obligatorio, categoría derivada del concepto y tipo de categoría

Revision ID: k1l2m3n4o5p6
Revises: j1k2l3m4n5o6
Create Date: 2026-10-31

Qué hace (en este orden, dentro de una sola transacción):

1. categories.kind (expense | income | transfer | any). Se completa así:
   - "Transacciones" → transfer, "Sin clasificar" → any.
   - Si la categoría tiene movimientos: el tipo de sus movimientos; si tiene
     de más de un tipo (ej: gastos y transferencias) → any.
   - Sin movimientos: "income" si el nombre parece de ingresos (sueldo,
     salario, ingreso, aguinaldo, propina); si no, "expense".
2. Conceptos sin categoría → la categoría con la que más se usaron; si nunca
   se usaron, "Sin clasificar" (se crea si el usuario no la tiene).
3. Movimientos sin concepto → un concepto genérico de su categoría, con el
   nombre de la categoría (o "<Categoría> (general)" si ese nombre ya lo usa
   un concepto de otra categoría). La categoría del movimiento NO cambia.
4. concepts.category_id y transactions.concept_id pasan a NOT NULL.

No se borra nada ni se cambia la categoría de ningún movimiento existente.
El downgrade quita las restricciones NOT NULL y la columna kind (los
conceptos creados en el paso 3 quedan, porque ya están en uso).
"""
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = 'k1l2m3n4o5p6'
down_revision = 'j1k2l3m4n5o6'
branch_labels = None
depends_on = None

_INCOME_WORDS = ("sueldo", "salario", "ingreso", "aguinaldo", "propina", "jornal")


def upgrade() -> None:
    conn = op.get_bind()

    # ── 1. categories.kind ────────────────────────────────────────────────────
    op.add_column(
        'categories',
        sa.Column('kind', sa.String(length=10), nullable=False, server_default='expense'),
    )

    cats = conn.execute(sa.text("SELECT id, user_id, name, slug FROM categories")).fetchall()
    types_by_cat: dict = {}
    for cat_id, tx_type in conn.execute(sa.text(
        "SELECT DISTINCT category_id, CAST(type AS TEXT) FROM transactions WHERE is_deleted = false"
    )):
        types_by_cat.setdefault(cat_id, set()).add(str(tx_type).lower())

    kinds_count: dict = {}
    for cat_id, _user_id, name, slug in cats:
        types = types_by_cat.get(cat_id, set())
        if slug == "transacciones":
            kind = "transfer"
        elif slug == "sin-clasificar":
            kind = "any"
        elif len(types) == 1:
            kind = next(iter(types))
        elif len(types) > 1:
            kind = "any"
        elif any(w in (name or "").lower() for w in _INCOME_WORDS):
            kind = "income"
        else:
            kind = "expense"
        if kind not in ("expense", "income", "transfer", "any"):
            kind = "any"
        kinds_count[kind] = kinds_count.get(kind, 0) + 1
        if kind != "expense":
            conn.execute(sa.text("UPDATE categories SET kind = :k WHERE id = :id"), {"k": kind, "id": cat_id})

    # ── helpers ───────────────────────────────────────────────────────────────
    fallback_by_user: dict = {}

    def fallback_category(user_id):
        if user_id in fallback_by_user:
            return fallback_by_user[user_id]
        row = conn.execute(sa.text(
            "SELECT id FROM categories WHERE user_id = :u AND slug = 'sin-clasificar'"
        ), {"u": user_id}).first()
        if row:
            cat_id = row[0]
        else:
            cat_id = uuid.uuid4()
            conn.execute(sa.text(
                "INSERT INTO categories (id, user_id, name, slug, icon, color, is_system, kind) "
                "VALUES (:id, :u, 'Sin clasificar', 'sin-clasificar', 'help-circle', '#6B7280', true, 'any')"
            ), {"id": cat_id, "u": user_id})
        fallback_by_user[user_id] = cat_id
        return cat_id

    # ── 2. conceptos sin categoría ────────────────────────────────────────────
    orphans = conn.execute(sa.text(
        "SELECT id, user_id FROM concepts WHERE category_id IS NULL"
    )).fetchall()
    for concept_id, user_id in orphans:
        row = conn.execute(sa.text(
            "SELECT category_id FROM transactions WHERE concept_id = :c "
            "GROUP BY category_id ORDER BY COUNT(*) DESC LIMIT 1"
        ), {"c": concept_id}).first()
        cat_id = row[0] if row else fallback_category(user_id)
        conn.execute(sa.text("UPDATE concepts SET category_id = :cat WHERE id = :id"),
                     {"cat": cat_id, "id": concept_id})

    # ── 3. movimientos sin concepto ───────────────────────────────────────────
    groups = conn.execute(sa.text(
        "SELECT t.user_id, t.category_id, c.name, COUNT(*) "
        "FROM transactions t JOIN categories c ON c.id = t.category_id "
        "WHERE t.concept_id IS NULL GROUP BY t.user_id, t.category_id, c.name"
    )).fetchall()
    filled = 0
    created = 0
    for user_id, cat_id, cat_name, n in groups:
        concept_id = None
        for candidate in (cat_name, f"{cat_name} (general)"):
            candidate = candidate[:100]
            row = conn.execute(sa.text(
                "SELECT id, category_id FROM concepts WHERE user_id = :u AND lower(name) = lower(:n)"
            ), {"u": user_id, "n": candidate}).first()
            if row and row[1] == cat_id:
                concept_id = row[0]
                break
            if row is None:
                concept_id = uuid.uuid4()
                conn.execute(sa.text(
                    "INSERT INTO concepts (id, user_id, category_id, name, frequency_score, is_system) "
                    "VALUES (:id, :u, :cat, :n, 0, false)"
                ), {"id": concept_id, "u": user_id, "cat": cat_id, "n": candidate})
                created += 1
                break
        if concept_id is None:  # los dos nombres ya existen en otras categorías
            concept_id = uuid.uuid4()
            conn.execute(sa.text(
                "INSERT INTO concepts (id, user_id, category_id, name, frequency_score, is_system) "
                "VALUES (:id, :u, :cat, :n, 0, false)"
            ), {"id": concept_id, "u": user_id, "cat": cat_id,
                "n": f"{cat_name} ({str(concept_id)[:4]})"[:100]})
            created += 1
        conn.execute(sa.text(
            "UPDATE transactions SET concept_id = :c WHERE concept_id IS NULL "
            "AND user_id = :u AND category_id = :cat"
        ), {"c": concept_id, "u": user_id, "cat": cat_id})
        conn.execute(sa.text(
            "UPDATE concepts SET frequency_score = frequency_score + :n WHERE id = :c"
        ), {"n": int(n), "c": concept_id})
        filled += int(n)

    # ── 4. NOT NULL ───────────────────────────────────────────────────────────
    op.alter_column('concepts', 'category_id', existing_type=postgresql.UUID(), nullable=False)
    op.alter_column('transactions', 'concept_id', existing_type=postgresql.UUID(), nullable=False)

    mismatched = conn.execute(sa.text(
        "SELECT COUNT(*) FROM transactions t JOIN concepts c ON c.id = t.concept_id "
        "WHERE t.category_id <> c.category_id AND t.is_deleted = false"
    )).scalar()

    print(
        f"[k1l2m3n4o5p6] categorías por tipo: {kinds_count} · "
        f"conceptos sin categoría asignados: {len(orphans)} · "
        f"movimientos sin concepto completados: {filled} (conceptos genéricos creados: {created}) · "
        f"movimientos cuya categoría difiere de la de su concepto (se dejan como están): {mismatched}"
    )


def downgrade() -> None:
    op.alter_column('transactions', 'concept_id', existing_type=postgresql.UUID(), nullable=True)
    op.alter_column('concepts', 'category_id', existing_type=postgresql.UUID(), nullable=True)
    op.drop_column('categories', 'kind')
