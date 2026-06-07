"""Fixtures compartidas para tests de parsers bancarios."""
import io
import uuid
import pytest
from unittest.mock import MagicMock


@pytest.fixture
def mock_cat():
    """Mock de CategorizadorLocal que siempre devuelve 'Sin clasificar'."""
    cat = MagicMock()
    cat.categorizar.return_value = ("Sin clasificar", None)
    return cat


@pytest.fixture
def cuenta_id():
    return uuid.uuid4()


# ---------------------------------------------------------------------------
# Helpers para crear fixtures Excel (openpyxl)
# ---------------------------------------------------------------------------

def xlsx_bytes(headers: list, rows: list) -> bytes:
    """Crea un XLSX mínimo con los headers y filas dados."""
    import openpyxl
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append(headers)
    for row in rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def csv_bytes(header: str, rows: list[str], encoding: str = "utf-8") -> bytes:
    """Crea CSV bytes desde un header y lista de líneas."""
    content = "\n".join([header] + rows)
    return content.encode(encoding)
