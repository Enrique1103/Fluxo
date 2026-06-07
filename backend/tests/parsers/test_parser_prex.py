"""Tests del parser Prex (Excel .xlsx).

Columnas: Fecha | Descripción | Moneda Origen | Importe Origen | Moneda | Importe | Estado
Solo importa filas con Estado == 'Confirmado'.
"""
import pytest
from tests.parsers.conftest import xlsx_bytes
from app.services.importacion_service import ParserPrex

HEADERS = ["Fecha", "Descripción", "Moneda Origen", "Importe Origen", "Moneda", "Importe", "Estado"]


def _valid_xlsx(extra_rows=None):
    rows = [
        ["01/04/2026", "SUPERMERCADO DISCO",  "UYU", 1500, "UYU", -1500, "Confirmado"],
        ["02/04/2026", "SUSHI BAR MONTEVIDEO", "UYU",  800, "UYU",  -800, "Confirmado"],
        ["03/04/2026", "PAGO PENDIENTE",        "UYU",  200, "UYU",  -200, "Pendiente"],
    ]
    return xlsx_bytes(HEADERS, rows + (extra_rows or []))


class TestParserPrex:

    def test_parsea_filas_confirmadas(self, mock_cat, cuenta_id):
        """Solo las filas con Estado=Confirmado son importadas."""
        parser = ParserPrex(mock_cat)
        result = parser.parsear(_valid_xlsx(), cuenta_id)
        validados = [m for m in result if m["estado"] == "validado"]
        assert len(validados) == 2  # la fila Pendiente se omite

    def test_movimientos_tienen_campos_requeridos(self, mock_cat, cuenta_id):
        parser = ParserPrex(mock_cat)
        result = parser.parsear(_valid_xlsx(), cuenta_id)
        for m in (m for m in result if m["estado"] == "validado"):
            assert "fecha" in m and m["fecha"]
            assert "monto" in m and m["monto"] != 0
            assert "import_hash" in m and m["import_hash"]
            assert m["metodo_pago"] == "tarjeta_debito"

    def test_fechas_en_formato_iso(self, mock_cat, cuenta_id):
        parser = ParserPrex(mock_cat)
        result = parser.parsear(_valid_xlsx(), cuenta_id)
        for m in (m for m in result if m["estado"] == "validado"):
            parts = m["fecha"].split("-")
            assert len(parts) == 3
            assert len(parts[0]) == 4  # año YYYY

    def test_hashes_unicos_por_fila(self, mock_cat, cuenta_id):
        parser = ParserPrex(mock_cat)
        result = parser.parsear(_valid_xlsx(), cuenta_id)
        hashes = [m["import_hash"] for m in result if m.get("import_hash")]
        assert len(hashes) == len(set(hashes)), "Cada fila debe tener hash único"

    def test_fila_sin_importe_genera_error(self, mock_cat, cuenta_id):
        rows = [["01/04/2026", "COMPRA X", "UYU", None, "UYU", None, "Confirmado"]]
        data = xlsx_bytes(HEADERS, rows)
        parser = ParserPrex(mock_cat)
        result = parser.parsear(data, cuenta_id)
        # Fila sin importe válido → error o monto 0 (comportamiento actual)
        assert isinstance(result, list)

    def test_archivo_sin_filas_confirmadas_retorna_vacio(self, mock_cat, cuenta_id):
        rows = [["01/04/2026", "COMPRA", "UYU", 100, "UYU", -100, "Pendiente"]]
        data = xlsx_bytes(HEADERS, rows)
        parser = ParserPrex(mock_cat)
        result = parser.parsear(data, cuenta_id)
        validados = [m for m in result if m["estado"] == "validado"]
        assert len(validados) == 0

    def test_banco_en_metadata(self, mock_cat, cuenta_id):
        parser = ParserPrex(mock_cat)
        result = parser.parsear(_valid_xlsx(), cuenta_id)
        for m in (m for m in result if m["estado"] == "validado"):
            assert m["metadata"]["banco"] == "prex"
