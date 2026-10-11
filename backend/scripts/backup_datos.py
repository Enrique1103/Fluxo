"""
Backup de SOLO LECTURA de la base de Fluxo: exporta cada tabla a CSV dentro de un .zip.

Uso (PowerShell, desde backend/):
    $env:BACKUP_DATABASE_URL = "postgresql://...tu conexión de Supabase..."
    .\\venv\\Scripts\\python.exe scripts\\backup_datos.py

- Abre la conexión en modo READ ONLY: no puede modificar nada.
- Guarda el .zip en backend/backups/ (carpeta ignorada por git).
- El .zip incluye resumen.txt con la cantidad de filas por tabla y la versión de migración,
  para comparar después de publicar.
"""
import csv
import io
import os
import sys
import zipfile
from datetime import datetime
from pathlib import Path

from sqlalchemy import create_engine, text

url = os.environ.get("BACKUP_DATABASE_URL")
if not url:
    sys.exit("Falta BACKUP_DATABASE_URL (la cadena de conexión de tu base).")
if url.startswith("postgres://"):
    url = "postgresql://" + url[len("postgres://"):]

out_dir = Path(__file__).resolve().parents[1] / "backups"
out_dir.mkdir(exist_ok=True)
stamp = datetime.now().strftime("%Y%m%d_%H%M")
out = out_dir / f"fluxo_backup_{stamp}.zip"

engine = create_engine(url)
is_pg = engine.dialect.name == "postgresql"
resumen = [f"Backup de Fluxo — {datetime.now():%Y-%m-%d %H:%M}", ""]

with engine.connect() as conn:
    if is_pg:
        conn.execute(text("SET TRANSACTION READ ONLY"))
        tables = [r[0] for r in conn.execute(text(
            "SELECT table_name FROM information_schema.tables "
            "WHERE table_schema = 'public' AND table_type = 'BASE TABLE' ORDER BY table_name"
        ))]
    else:  # SQLite (solo para probar el script)
        tables = [r[0] for r in conn.execute(text(
            "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
        ))]

    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as zf:
        total = 0
        for t in tables:
            result = conn.execute(text(f'SELECT * FROM "{t}"'))
            buf = io.StringIO()
            w = csv.writer(buf)
            w.writerow(result.keys())
            n = 0
            for row in result:
                w.writerow(["" if v is None else v for v in row])
                n += 1
            zf.writestr(f"{t}.csv", buf.getvalue())
            resumen.append(f"{t}: {n} filas")
            total += n
        if "alembic_version" in tables:
            v = conn.execute(text("SELECT version_num FROM alembic_version")).scalar()
            resumen += ["", f"Versión de migración: {v}"]
        resumen += ["", f"Total: {total} filas en {len(tables)} tablas"]
        zf.writestr("resumen.txt", "\n".join(resumen))

print("\n".join(resumen))
print(f"\nBackup guardado en: {out}")
