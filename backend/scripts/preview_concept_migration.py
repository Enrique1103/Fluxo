"""
Vista previa (SIN GUARDAR NADA) de la migración k1l2m3n4o5p6:
concepto obligatorio + tipo de categoría.

Corre la migración dentro de una transacción, muestra cómo quedaría cada
categoría y los conceptos nuevos, y después hace ROLLBACK.

Uso (desde backend/, con DATABASE_URL apuntando a la base):
    python scripts/preview_concept_migration.py
"""
import importlib.util
import os
import sys

import sqlalchemy as sa
from alembic.migration import MigrationContext
from alembic.operations import Operations

HERE = os.path.dirname(os.path.abspath(__file__))
MIGRATION = os.path.join(HERE, "..", "alembic", "versions", "k1l2m3n4o5p6_concept_required_category_kind.py")


def main() -> None:
    url = os.getenv("DATABASE_URL")
    if not url:
        sys.exit("Falta DATABASE_URL")
    engine = sa.create_engine(url)
    spec = importlib.util.spec_from_file_location("mig", MIGRATION)
    mig = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mig)

    with engine.connect() as conn:
        trans = conn.begin()
        try:
            version = conn.execute(sa.text("SELECT version_num FROM alembic_version")).scalar()
            if version != mig.down_revision:
                sys.exit(f"La base está en {version}; esta vista previa es para {mig.down_revision}.")
            before = {r[0] for r in conn.execute(sa.text("SELECT id FROM concepts"))}
            ctx = MigrationContext.configure(conn)
            with Operations.context(ctx):
                mig.upgrade()
            print("\nCategorías (tipo → qué movimientos la ofrecen):")
            for name, kind, n in conn.execute(sa.text(
                "SELECT c.name, c.kind, COUNT(co.id) FROM categories c "
                "LEFT JOIN concepts co ON co.category_id = c.id GROUP BY c.name, c.kind ORDER BY c.kind, c.name"
            )):
                print(f"  {kind:9} {name}  ({n} conceptos)")
            print("\nConceptos nuevos (para movimientos que no tenían concepto):")
            rows = conn.execute(sa.text(
                "SELECT co.id, co.name, c.name, co.frequency_score FROM concepts co "
                "JOIN categories c ON c.id = co.category_id ORDER BY c.name"
            )).fetchall()
            for cid, name, cat, freq in rows:
                if cid not in before:
                    print(f"  {name}  →  {cat}  ({freq} movimientos)")
        finally:
            trans.rollback()
            print("\nROLLBACK: no se guardó ningún cambio.")


if __name__ == "__main__":
    main()
