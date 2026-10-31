"""ordenar categorías y conceptos de la cuenta de Luis (lleonbola2@gmail.com)

Revision ID: m1n2o3p4q5r6
Revises: l1m2n3o4p5q6
Create Date: 2026-10-31

Aplica la propuesta acordada en el hilo (propuesta-etiquetas.md) SOLO en esa cuenta.
Cada paso es tolerante: si la categoría/concepto no existe, o el nombre nuevo ya
está usado, se saltea. Mover un concepto mueve también sus movimientos y planes
de cuotas. No borra movimientos. El downgrade no deshace nada (renombres de datos).
"""
import re
import unicodedata
import uuid

from alembic import op
import sqlalchemy as sa

revision = 'm1n2o3p4q5r6'
down_revision = 'l1m2n3o4p5q6'
branch_labels = None
depends_on = None

EMAIL = "lleonbola2@gmail.com"

CATEGORY_RENAMES = [
    ("Sueldo Nominal", "Sueldo"),
    ("Sueldo en Negro", "Trabajos Extra"),
    ("Vivienda", "Hogar"),
    ("Aseo", "Cuidado Personal"),
    ("Regalo", "Regalos"),
    ("Remesas-Cuba", "Remesas"),
    ("Vacaciones", "Viajes"),
]
CATEGORY_KINDS = {
    "Sueldo": "income", "Trabajos Extra": "income", "Otros Ingresos": "income",
    "Extracción de Dinero": "transfer", "Inversión": "any",
    "Hogar": "expense", "Compras": "expense",
}
# (nombre actual, categoría actual o None, nombre nuevo)
CONCEPT_RENAMES = [
    ("Liquidación de Sueldo", None, "Liquidación"),
    ("Ticket de Alimentación", None, "Ticket Alimentación"),
    ("Propina", None, "Propinas"),
    ("Regalo", "Otros Ingresos", "Regalo Recibido"),
    ("Recargar Stm", None, "Recarga STM"),
    ("Uber/Taxi", None, "Uber / Taxi"),
    ("Transporte Edintor.sa", None, "Traslado Trabajo"),
    ("Compra en Temu", None, "Compras Online"),
    ("Extracción en el Abitab", None, "Abitab"),
    ("Itau Asset", None, "Itaú Asset"),
    ("Alimentación", "Alimentación", "Otros Alimentos"),
    ("Vestimenta", "Vestimenta", "Ropa"),
    ("Remesas-Cuba", "Remesas", "Envío a Cuba"),
    ("Vacaciones", "Viajes", "Gastos de Viaje"),
    ("Gastos Varios del Hogar", None, "Balanceo del Hogar"),
]
# (concepto, categoría destino)
CONCEPT_MOVES = [
    ("Internet", "Hogar"),
    ("Limpieza", "Hogar"),
    ("Gimnasio", "Salud"),
    ("Compras Online", "Compras"),
    ("Balanceo del Hogar", "Hogar"),
]
# (concepto, categoría, es reintegro)
CONCEPT_CREATES = [
    ("Reintegro del Hogar", "Hogar", True),
    ("Cajero Automático", "Extracción de Dinero", False),
]


def _slug(text: str) -> str:
    t = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode("ascii")
    t = re.sub(r"[^\w\s-]", "", t.lower())
    return re.sub(r"[-\s]+", "-", t).strip("-")[:60]


def upgrade() -> None:
    conn = op.get_bind()
    uid = conn.execute(sa.text("SELECT id FROM users WHERE lower(email) = :e"), {"e": EMAIL}).scalar()
    if uid is None:
        print(f"[m1n2o3p4q5r6] no existe el usuario {EMAIL}: nada que hacer")
        return
    done: list[str] = []

    def cat_id(name):
        return conn.execute(sa.text(
            "SELECT id FROM categories WHERE user_id = :u AND lower(name) = lower(:n)"
        ), {"u": uid, "n": name}).scalar()

    def concept(name, cat_name=None):
        row = conn.execute(sa.text(
            "SELECT co.id, co.category_id, ca.name FROM concepts co JOIN categories ca ON ca.id = co.category_id "
            "WHERE co.user_id = :u AND lower(co.name) = lower(:n)"
        ), {"u": uid, "n": name}).first()
        if row and (cat_name is None or row[2].lower() == cat_name.lower()):
            return row
        return None

    # 1. Categorías: renombrar
    for old, new in CATEGORY_RENAMES:
        cid = cat_id(old)
        if cid is None or cat_id(new) is not None:
            continue
        if conn.execute(sa.text("SELECT 1 FROM categories WHERE user_id = :u AND slug = :s AND id <> :c"),
                        {"u": uid, "s": _slug(new), "c": cid}).first():
            continue
        conn.execute(sa.text("UPDATE categories SET name = :n, slug = :s WHERE id = :c AND is_system = false"),
                     {"n": new, "s": _slug(new), "c": cid})
        done.append(f"categoría {old} → {new}")

    # 2. Categoría nueva "Compras"
    if cat_id("Compras") is None:
        conn.execute(sa.text(
            "INSERT INTO categories (id, user_id, name, slug, icon, color, is_system, kind) "
            "VALUES (:id, :u, 'Compras', 'compras', 'shopping-bag', '#F472B6', false, 'expense')"
        ), {"id": uuid.uuid4(), "u": uid})
        done.append("categoría nueva Compras")

    # 3. Tipos
    for name, kind in CATEGORY_KINDS.items():
        cid = cat_id(name)
        if cid is not None:
            conn.execute(sa.text("UPDATE categories SET kind = :k WHERE id = :c"), {"k": kind, "c": cid})

    # 4. Conceptos: renombrar
    for old, cat_name, new in CONCEPT_RENAMES:
        row = concept(old, cat_name)
        if row is None or concept(new) is not None:
            continue
        conn.execute(sa.text("UPDATE concepts SET name = :n WHERE id = :c AND is_system = false"),
                     {"n": new, "c": row[0]})
        done.append(f"concepto {old} → {new}")

    # 5. Conceptos: mover (y sus movimientos / planes de cuotas)
    for name, dest in CONCEPT_MOVES:
        row, dest_id = concept(name), cat_id(dest)
        if row is None or dest_id is None or row[1] == dest_id:
            continue
        conn.execute(sa.text("UPDATE concepts SET category_id = :d WHERE id = :c"), {"d": dest_id, "c": row[0]})
        conn.execute(sa.text("UPDATE transactions SET category_id = :d WHERE concept_id = :c"), {"d": dest_id, "c": row[0]})
        conn.execute(sa.text("UPDATE instalment_plans SET category_id = :d WHERE concept_id = :c"), {"d": dest_id, "c": row[0]})
        done.append(f"concepto {name} → {dest}")

    # 6. Conceptos nuevos
    for name, cat_name, refund in CONCEPT_CREATES:
        dest_id = cat_id(cat_name)
        if dest_id is None or concept(name) is not None:
            continue
        conn.execute(sa.text(
            "INSERT INTO concepts (id, user_id, category_id, name, frequency_score, is_system, is_refund) "
            "VALUES (:id, :u, :c, :n, 0, false, :r)"
        ), {"id": uuid.uuid4(), "u": uid, "c": dest_id, "n": name, "r": refund})
        done.append(f"concepto nuevo {name} ({cat_name})")

    # 7. "Aporte al Hogar": se borra solo si quedó vacía del todo
    cid = cat_id("Aporte al Hogar")
    if cid is not None:
        in_use = any(conn.execute(sa.text(q), {"c": cid}).first() for q in (
            "SELECT 1 FROM concepts WHERE category_id = :c",
            "SELECT 1 FROM transactions WHERE category_id = :c",
            "SELECT 1 FROM instalment_plans WHERE category_id = :c",
            "SELECT 1 FROM budgets WHERE category_id = :c",
        ))
        if not in_use:
            conn.execute(sa.text("DELETE FROM categories WHERE id = :c"), {"c": cid})
            done.append("categoría Aporte al Hogar borrada (vacía)")

    print(f"[m1n2o3p4q5r6] {len(done)} cambios: " + "; ".join(done))


def downgrade() -> None:
    pass
