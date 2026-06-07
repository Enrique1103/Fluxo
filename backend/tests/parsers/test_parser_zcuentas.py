"""Tests del parser Zcuentas (Excel .xlsx).

Estructura: 2 filas vacías de metadata, luego header, luego datos.
Columnas: Fecha | Tipo | Cuenta | Concepto | Etiqueta | Descripción | Importe | Moneda
Tipos: Gasto → expense, Ingreso → income, Transferencia → solo pata negativa (salida).
"""
import io
import pytest
import openpyxl
from app.services.importacion_service import ParserZcuentas

HEADERS_Z = ["Fecha", "Tipo", "Cuenta", "Concepto", "Etiqueta", "Descripción", "Importe", "Moneda"]


def _zcuentas_xlsx(data_rows: list) -> bytes:
    """Crea un Excel con la estructura de Zcuentas (2 filas vacías + header + datos)."""
    wb = openpyxl.Workbook()
    ws = wb.active
    ws.append([])           # fila 1 vacía (metadata)
    ws.append([])           # fila 2 vacía (metadata)
    ws.append(HEADERS_Z)   # fila 3: header
    for row in data_rows:
        ws.append(row)
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def _valid_xlsx():
    from datetime import date
    rows = [
        [date(2026, 4, 1), "Gasto",         "Cuenta UYU", "Supermercado", "",   "DISCO S.A.", -1500, "UYU"],
        [date(2026, 4, 2), "Ingreso",        "Cuenta UYU", "Sueldo",       "",   "EMPRESA SA",  5000, "UYU"],
        [date(2026, 4, 3), "Transferencia",  "Cuenta UYU", "Transf.",      "",   "A cuenta 2", -2000, "UYU"],
        [date(2026, 4, 3), "Transferencia",  "Cuenta 2",   "Transf.",      "",   "De cuenta 1", 2000, "UYU"],
    ]
    return _zcuentas_xlsx(rows)


class TestParserZcuentas:

    def test_parsea_gastos_e_ingresos(self, mock_cat, cuenta_id):
        parser = ParserZcuentas(mock_cat)
        result = parser.parsear(_valid_xlsx(), cuenta_id)
        validados = [m for m in result if m["estado"] == "validado"]
        # Gasto + Ingreso + 1 pata negativa de Transferencia = 3
        assert len(validados) == 3

    def test_gasto_es_negativo(self, mock_cat, cuenta_id):
        parser = ParserZcuentas(mock_cat)
        result = parser.parsear(_valid_xlsx(), cuenta_id)
        gastos = [m for m in result if "DISCO" in (m.get("descripcion") or "")]
        assert len(gastos) >= 1
        assert gastos[0]["monto"] < 0

    def test_ingreso_es_positivo(self, mock_cat, cuenta_id):
        parser = ParserZcuentas(mock_cat)
        result = parser.parsear(_valid_xlsx(), cuenta_id)
        ingresos = [m for m in result if "EMPRESA" in (m.get("descripcion") or "")]
        assert len(ingresos) >= 1
        assert ingresos[0]["monto"] > 0

    def test_transferencia_solo_pata_negativa(self, mock_cat, cuenta_id):
        """Solo la pata negativa (dinero que sale) se importa."""
        parser = ParserZcuentas(mock_cat)
        result = parser.parsear(_valid_xlsx(), cuenta_id)
        transferencias = [m for m in result
                          if m.get("metadata", {}).get("tipo_zcuentas") == "Transferencia"]
        assert all(m["monto"] < 0 for m in transferencias)

    def test_fechas_en_formato_iso(self, mock_cat, cuenta_id):
        parser = ParserZcuentas(mock_cat)
        result = parser.parsear(_valid_xlsx(), cuenta_id)
        for m in (m for m in result if m["estado"] == "validado"):
            assert m["fecha"].count("-") == 2
            assert len(m["fecha"].split("-")[0]) == 4

    def test_hashes_unicos(self, mock_cat, cuenta_id):
        parser = ParserZcuentas(mock_cat)
        result = parser.parsear(_valid_xlsx(), cuenta_id)
        hashes = [m["import_hash"] for m in result if m.get("import_hash")]
        assert len(hashes) == len(set(hashes))

    def test_columnas_faltantes_lanza_error(self, mock_cat, cuenta_id):
        """Excel sin columnas requeridas lanza ValueError."""
        import openpyxl
        wb = openpyxl.Workbook()
        ws = wb.active
        ws.append([])
        ws.append([])
        ws.append(["Columna1", "Columna2"])
        ws.append(["01/04/2026", "valor"])
        buf = io.BytesIO()
        wb.save(buf)
        parser = ParserZcuentas(mock_cat)
        with pytest.raises(ValueError):
            parser.parsear(buf.getvalue(), cuenta_id)

    def test_banco_en_metadata(self, mock_cat, cuenta_id):
        parser = ParserZcuentas(mock_cat)
        result = parser.parsear(_valid_xlsx(), cuenta_id)
        for m in (m for m in result if m["estado"] == "validado"):
            assert m["metadata"]["banco"] == "zcuentas"
